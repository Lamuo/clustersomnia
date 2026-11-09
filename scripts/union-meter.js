import { UnionConfigApp } from "./union-config-app.js";
import { displayedEffects, tokenEffects } from "./persistence.js";
import { tempHp } from "./temp-hp.js";
import { popOut, closePopout } from "./popout.js";
import { effectTags, specializationOf } from "./tags.js";

/**
 * Puts `nodes` (elements or text) into `container`, but only when they differ from what is there. Every update of the
 * party redraws all the cards; without this check each redraw destroyed and rebuilt every bubble, tag and icon, so
 * pictures reloaded and animations restarted: a flash on the whole stack after any single click. Now an update that
 * changes nothing touches nothing. Returns whether the container was changed.
 */
function syncChildren(container, nodes) {
  const signature = nodes.map(node => (typeof node === "string" ? node : node.outerHTML)).join("");
  if (container.dataset.sig === signature) return false;
  container.dataset.sig = signature;
  container.replaceChildren(...nodes);
  return true;
}

/** A small square image for an emblem that is given as a picture instead of a FontAwesome icon. */
function miniIcon(src) {
  const image = document.createElement("img");
  image.className = "cu-mini-icon";
  image.src = src;
  image.draggable = false;
  return image;
}

const MODULE_ID = "clustersomnia";
const SOCKET_CHANNEL = "module.clustersomnia";
const ROOT_ID = "clustersomnia-union";
const PRESET_SKINS = { "daniele-v1": "Daniele v1" };
const DEFAULT_SKIN = "daniele-v1";

const skinCache = new Map();

const DEFAULT_HP_COLORS = { ok: "#4cc46a", injured: "#f0a030", down: "#d03a3a" };

const DEFAULT_SEGMENT_COLORS = { on: "#ff7a1a", on2: "#ffd27a", off: "#120d0c", border: "#eadfc6" };

const DETAIL_SETTINGS = {
  unionShowStats: "Party: mostra difesa, velocità, incubo, corallo bianco e rateo di cura",
  unionShowEffects: "Card estesa: mostra gli effetti attivi",
  unionShowCounters: "Card estesa: mostra i contatori del tracker",
  unionShowTags: "Party: mostra i tag degli effetti temporanei (Atk, Def...)"
};

// Cards that clicking the portrait has expanded (effects and counters shown); remembered per client.
function expandedIds() {
  return new Set(game.settings.get(MODULE_ID, "unionExpanded").ids ?? []);
}

function toggleExpanded(actorId) {
  const ids = expandedIds();
  if (!ids.delete(actorId)) ids.add(actorId);
  // The setting's onChange redraws every card; the card's key changes with the set, so the card is rebuilt.
  return game.settings.set(MODULE_ID, "unionExpanded", { ids: [...ids] });
}

// Effects and counters only appear on the personal card (personal-card.js); the shared cards stay compact.
const CARD_CHROME = `<div class="cu-grip" title="Trascina per spostare, doppio clic per ripristinare"><i class="fas fa-grip"></i></div>
    <button type="button" class="cu-popout" title="Stacca in una finestra (per il secondo schermo)"><i class="fas fa-up-right-from-square"></i></button>
    <div class="cu-resize" title="Trascina per ridimensionare, doppio clic per ripristinare"></div>`;

/* -------------------------------------------- */
/*  State                                        */
/*  A PG's points are the uses of its "Punti     */
/*  Unione" talent (the sheet is the source of   */
/*  truth, max comes from the talent too). The   */
/*  pairs already used this fight live in one    */
/*  world setting, so the GM is the single       */
/*  writer.                                      */
/* -------------------------------------------- */

const ENTRY_NAME = "Punti Unione";
const FALLBACK_MAX = 5;

/** The actor's "Punti Unione" talent, if it has one. */
export function unionItem(actor) {
  return actor.items.find(item => item.type === "talent" && item.name === ENTRY_NAME);
}

function pointsOf(actor) {
  return Number(unionItem(actor)?.system.uses?.value) || 0;
}

function maxOf(actor) {
  return Number(unionItem(actor)?.system.uses?.max) || FALLBACK_MAX;
}

/**
 * Face crops shipped with the module, matched on any word of the actor's name ("Lady Diane" -> diane).
 * They are only the default: `unionImages` overrides them per actor.
 */
const DEFAULT_BUBBLES = ["alsa", "black", "diane", "edgar", "quark", "vishara", "zoe"];

function bubbleKey(actor) {
  return actor.name.toLowerCase().split(/\s+/).find(word => DEFAULT_BUBBLES.includes(word));
}

/** Short label for a PG: the name that matches its crop, else the first word. */
export function shortName(actor) {
  const key = bubbleKey(actor);
  return key ? actor.name.split(/\s+/).find(word => word.toLowerCase() === key) : actor.name.split(/\s+/)[0];
}

// The crops are named <name>.jpg, except the ones that were renamed in the art folder.
const BUBBLE_FILES = { alsa: "alsa-bubble.jpg" };

export function defaultBubble(actor) {
  const key = bubbleKey(actor);
  return key ? `modules/${MODULE_ID}/art/bubbles/${BUBBLE_FILES[key] ?? `${key}.jpg`}` : actor.img;
}

/** Image shown in the "ready" bubble of this PG: custom, else the shipped crop, else the sheet portrait. */
export function bubbleImage(actor) {
  return game.settings.get(MODULE_ID, "unionImages")[actor.id] || defaultBubble(actor);
}

export function pairKey(a, b) {
  return [a, b].sort().join("|");
}

/** PCs that take part in the meter: characters carrying the "Punti Unione" talent (GM-owned ones included). */
export function unionParty() {
  return game.actors
    .filter(actor => actor.type === "character" && unionItem(actor))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function pairCost(a, b) {
  const costs = game.settings.get(MODULE_ID, "unionCosts");
  const cost = costs[pairKey(a, b)] ?? game.settings.get(MODULE_ID, "unionDefaultCost");
  return Math.max(1, cost);
}

function getState() {
  return { used: game.settings.get(MODULE_ID, "unionState").used ?? [] };
}

/** Both PGs must reach the pair's cost and the pair must not have been used yet. */
function isReady(state, a, b) {
  if (a === b || state.used.includes(pairKey(a.id, b.id))) return false;
  const cost = pairCost(a.id, b.id);
  return pointsOf(a) >= cost && pointsOf(b) >= cost;
}

/* -------------------------------------------- */
/*  Settings                                     */
/* -------------------------------------------- */

Hooks.once("init", () => {
  const redraw = () => renderMeter();

  game.settings.register(MODULE_ID, "unionState", {
    scope: "world", config: false, type: Object, default: { used: [] }, onChange: redraw
  });
  game.settings.register(MODULE_ID, "unionCosts", {
    scope: "world", config: false, type: Object, default: {}, onChange: redraw
  });
  game.settings.register(MODULE_ID, "unionImages", {
    scope: "world", config: false, type: Object, default: {}, onChange: redraw
  });
  game.settings.register(MODULE_ID, "unionDefaultCost", {
    name: "Mossa unione: costo predefinito",
    hint: "PU richiesti a entrambi i PG, salvo costo specifico per la coppia (menu qui sotto).",
    scope: "world", config: true, type: Number, default: 5,
    range: { min: 1, max: 100, step: 1 }, onChange: redraw
  });
  game.settings.registerMenu(MODULE_ID, "unionConfig", {
    name: "Mossa unione: costi e reset",
    label: "Configura",
    hint: "Costo per ogni coppia di PG e azzeramento di punti e mosse usate.",
    icon: "fas fa-link",
    type: UnionConfigApp,
    restricted: true
  });
  game.settings.register(MODULE_ID, "unionSkin", {
    name: "Punti unione: skin",
    hint: "Skin del meter, uguale per tutti i giocatori.",
    scope: "world", config: true, type: String, default: DEFAULT_SKIN,
    choices: PRESET_SKINS, onChange: redraw
  });
  game.settings.register(MODULE_ID, "unionSkinFolder", {
    name: "Punti unione: cartella skin personalizzata",
    hint: "Cartella con skin.json e le immagini. Se impostata, ha la precedenza sulla skin scelta sopra.",
    scope: "world", config: true, type: String, default: "", filePicker: "folder", onChange: redraw
  });
  game.settings.register(MODULE_ID, "tagsEveryEffect", {
    name: "Tag: ogni effetto attivo conta",
    hint: "Se spento contano solo le magie, gli effetti temporanei e quelli scelti con Search Effects: niente livelli di percorso, equipaggiamento o talenti di classe.",
    scope: "world", config: true, type: Boolean, default: true, onChange: redraw
  });
  game.settings.register(MODULE_ID, "trackerShowTags", {
    name: "Tracker: mostra la sezione Tag",
    hint: "Pulsanti per aggiungere a mano bonus e penalità ai tag e riga dei tag dagli effetti. Si applica alla prossima apertura del Tracker.",
    scope: "client", config: true, type: Boolean, default: false
  });
  game.settings.register(MODULE_ID, "unionShow", {
    name: "Mostra i meter dei punti unione",
    scope: "client", config: true, type: Boolean, default: true, onChange: redraw
  });
  // The same cards, mounted at the top of the Combat Tracker (combat-party.js).
  game.settings.register(MODULE_ID, "unionShowInCombat", {
    name: "Party: mostra le card nel Combat Tracker",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: () => ui.combat?.render()
  });
  game.settings.register(MODULE_ID, "unionCombatScale", {
    name: "Party: scala delle card nel Combat Tracker",
    scope: "client", config: true, type: Number, default: 0.6,
    range: { min: 0.2, max: 1, step: 0.05 }, onChange: redraw
  });
  // What each row shows besides the portrait, HP and union bars; per client so anyone can lighten the panel.
  for (const [key, name] of Object.entries(DETAIL_SETTINGS)) {
    game.settings.register(MODULE_ID, key, {
      name, scope: "client", config: true, type: Boolean, default: true, onChange: redraw
    });
  }
  // Where this client dragged the stack; empty means "use the skin's position".
  game.settings.register(MODULE_ID, "unionPosition", {
    scope: "client", config: false, type: Object, default: {}
  });
  // The personal card: the PG's own full card, floating, with its own position and scale (personal-card.js).
  game.settings.register(MODULE_ID, "unionShowMine", {
    name: "Card personale: mostra la card dettagliata del mio PG",
    hint: "Card flottante con effetti e contatori. Per il GM mostra il token selezionato.",
    scope: "client", config: true, type: Boolean, default: true, onChange: redraw
  });
  game.settings.register(MODULE_ID, "unionMineScale", {
    name: "Card personale: scala",
    scope: "client", config: true, type: Number, default: 0.6,
    range: { min: 0.3, max: 2, step: 0.05 }, onChange: redraw
  });
  // Where each detached window (second screen) was last left: { x, y, w, h } per card.
  game.settings.register(MODULE_ID, "unionPopouts", {
    scope: "client", config: false, type: Object, default: {}
  });
  game.settings.register(MODULE_ID, "unionExpanded", {
    scope: "client", config: false, type: Object, default: { ids: [] }, onChange: redraw
  });
  game.settings.register(MODULE_ID, "unionMinePosition", {
    scope: "client", config: false, type: Object, default: {}
  });
  game.settings.register(MODULE_ID, "unionScale", {
    name: "Scala dei meter dei punti unione",
    scope: "client", config: true, type: Number, default: 0.5,
    range: { min: 0.3, max: 2, step: 0.1 }, onChange: redraw
  });
});

/* -------------------------------------------- */
/*  Editing - GM writes directly, Trusted and    */
/*  above ask the active GM over the socket.     */
/*  Operations are applied serially so two       */
/*  requests never overwrite each other.         */
/* -------------------------------------------- */

function canEdit(user = game.user) {
  return user.isGM || user.role >= CONST.USER_ROLES.TRUSTED;
}

/**
 * HP edits are not routed through the GM like union points: Foundry already lets the owners of an actor
 * (and the GM) update it, so the row just checks the same permission.
 */
function canEditHp(actor) {
  return actor.canUserModify(game.user, "update");
}

/**
 * `health.value` is the damage taken (the system flags "injured" from max / 2), so healing lowers it.
 * With the card's `row` the bar moves at once and the update follows, so clicks feel instant and quick
 * successive clicks add up on the displayed value instead of the not yet updated actor.
 */
function changeDamage(actor, delta, row) {
  const { value, max } = actor.system.characteristics.health;
  const base = row?.dataset.dmg !== undefined ? Number(row.dataset.dmg) : value;
  const baseTemp = row?.dataset.temp !== undefined ? Number(row.dataset.temp) : tempHp(actor);
  let damage = Math.min(max, Math.max(0, base + delta));
  let temp = baseTemp;
  // New damage eats the temporary HP first; healing leaves them alone.
  if (damage > base && temp) {
    const absorbed = Math.min(temp, damage - base);
    temp -= absorbed;
    damage -= absorbed;
  }
  if (damage === base && temp === baseTemp) return;
  // The new value goes on every card of this PG at once (stack, tracker, personal card), not only the one clicked.
  for (const card of rowsOf(actor.id)) paintHp(card, damage, max, temp);
  if (row && !row.isConnected) paintHp(row, damage, max, temp);
  // What is written is the click itself (+1 damage, -1 healing...), not the bar's numbers: the shield is taken off by the
  // actor's own hook from its real value, so a card that remembers an old shield can never overwrite it.
  writeDamage(actor, delta);
}

/** Every card of an actor, wherever it is shown: the floating stack and each card host. */
function rowsOf(actorId) {
  const roots = [stackEl, ...hosts.keys()].filter(Boolean);
  return roots.flatMap(root => [...root.querySelectorAll(`.cu-row[data-actor-id="${actorId}"]`)]);
}

// The system answers every health change with an async handler (handleHealthChange) that adds or removes the
// Injured / Incapacitated effects by "find, then add or delete". Two changes close together make two of those run at
// once and they trip over each other: duplicate effects, and "ActiveEffect ... does not exist" errors. So the HP
// writes of an actor go out one at a time, a burst of clicks becomes a single write of the final value (the bar
// already shows it), and each write waits until the system's own effect changes have settled.
const damageQueues = new Map();
const lastActivity = new Map();
const noteActivity = id => id && lastActivity.set(id, Date.now());
for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
  Hooks.on(hook, effect => noteActivity(effect.parent?.id ?? effect.parent?.parent?.id));
}
Hooks.on("updateActor", actor => noteActivity(actor.id));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Waits until nothing has touched the actor or its effects for a moment (at most a few seconds). */
async function settle(actor) {
  const started = Date.now();
  while (Date.now() - (lastActivity.get(actor.id) ?? 0) < 300 && Date.now() - started < 3000) await sleep(100);
}

/**
 * Changes the actor's damage by `delta` (positive hurts, negative heals): one write per burst of clicks, with the
 * clicks added up, one at a time, each after the system's reactions settled. The damage is worked out from the actor's
 * real value when the write goes out; damage taken also eats the temporary HP, which the actor's hook does.
 */
export function writeDamage(actor, delta) {
  const queue = damageQueues.get(actor.id) ?? { delta: 0, timer: null, running: Promise.resolve(), clicks: 0, busy: false };
  damageQueues.set(actor.id, queue);
  queue.delta += delta;
  queue.clicks++;
  // While a write is pending or on its way, the bar shows what was clicked: an answer from the server for an earlier
  // click must not put an older value back (updateHp skips a busy actor). It is redrawn from the real data at the end.
  queue.busy = true;
  clearTimeout(queue.timer);
  queue.timer = setTimeout(() => {
    queue.running = queue.running.then(async () => {
      const pending = queue.delta;
      queue.delta = 0;
      const seen = queue.clicks;
      try {
        const { value: current, max } = actor.system.characteristics.health;
        const value = Math.min(max, Math.max(0, Number(current) + pending));
        if (value !== Number(current)) await actor.update({ "system.characteristics.health.value": value });
      } finally {
        // Nobody clicked while it was written: what the actor says is now the truth, so show it.
        if (queue.clicks === seen) {
          queue.busy = false;
          redrawSoon(actor.id);
        }
      }
      await settle(actor);
    }).catch(error => console.error(`${MODULE_ID} | ${error.message}`));
  }, 250);
}

const OPERATIONS = {
  async delta(state, { actorId, delta }) {
    const actor = unionParty().find(candidate => candidate.id === actorId);
    if (!actor) return false;
    await setPoints(actor, pointsOf(actor) + delta);
    return false;
  },
  async use(state, { a, b }) {
    const [actorA, actorB] = [a, b].map(id => unionParty().find(candidate => candidate.id === id));
    if (!actorA || !actorB || !isReady(state, actorA, actorB)) return false;
    const cost = pairCost(a, b);
    await setPoints(actorA, pointsOf(actorA) - cost);
    await setPoints(actorB, pointsOf(actorB) - cost);
    state.used.push(pairKey(a, b));
    return true;
  },
  async resetUsed(state) {
    state.used = [];
    return true;
  }
};

function setPoints(actor, value) {
  return unionItem(actor).update({ "system.uses.value": Math.min(maxOf(actor), Math.max(0, value)) });
}

let queue = Promise.resolve();

function applyOperation(op, args) {
  queue = queue.then(async () => {
    const state = foundry.utils.deepClone(getState());
    if (await OPERATIONS[op](state, args)) await game.settings.set(MODULE_ID, "unionState", state);
  }).catch(err => console.error(`${MODULE_ID} | ${err.message}`));
  return queue;
}

export function requestOperation(op, args = {}) {
  if (game.user.isGM) return applyOperation(op, args);
  if (!game.users.activeGM) return ui.notifications.warn(`${MODULE_ID} | Nessun GM connesso: operazione annullata.`);
  game.socket.emit(SOCKET_CHANNEL, { type: "union-op", op, args, userId: game.user.id });
}

const RENAMED_SETTINGS = {
  world: ["State", "Costs", "DefaultCost", "Skin", "SkinFolder", "Images"],
  client: ["Show", "Scale", "Position"]
};

/** One-time move of values saved under the old "unity" setting names to the "union" ones. */
async function migrateSettings() {
  const client = game.settings.storage.get("client");
  for (const name of RENAMED_SETTINGS.client) {
    const oldKey = `${MODULE_ID}.unity${name}`;
    const raw = client.getItem(oldKey);
    if (raw === null) continue;
    if (client.getItem(`${MODULE_ID}.union${name}`) === null) {
      await game.settings.set(MODULE_ID, `union${name}`, JSON.parse(raw));
    }
    client.removeItem(oldKey);
  }

  if (!game.user.isGM) return;
  const world = game.settings.storage.get("world");
  for (const name of RENAMED_SETTINGS.world) {
    const old = world.getSetting(`${MODULE_ID}.unity${name}`);
    if (!old) continue;
    if (!world.getSetting(`${MODULE_ID}.union${name}`)) {
      // World setting documents already expose the parsed value.
      await game.settings.set(MODULE_ID, `union${name}`, old.value);
    }
    await old.delete();
  }
}

Hooks.once("ready", async () => {
  game.socket.on(SOCKET_CHANNEL, message => {
    if (message.type !== "union-op") return;
    if (game.users.activeGM?.id !== game.user.id) return;
    if (!canEdit(game.users.get(message.userId))) return;
    // Players may only nudge points and spend ready pairs; resets stay with the GM.
    if (!["delta", "use"].includes(message.op)) return;
    if (message.op === "delta" && !Number.isFinite(message.args?.delta)) return;
    applyOperation(message.op, message.args);
  });
  window.addEventListener("resize", foundry.utils.debounce(() => renderMeter(), 150));
  await migrateSettings();
  renderMeter();
});

// A fight ending clears the pairs used in it.
Hooks.on("deleteCombat", () => {
  if (game.users.activeGM?.id === game.user.id) applyOperation("resetUsed");
});

// Most changes concern one PG, and a full redraw of every card in every place is what made an HP click stall the
// browser (over 100 ms). So a change names the actor it touches and only that row is redrawn; changes that reach
// other rows (the union points decide who is ready with whom) ask for everything.
let pendingRows = new Set();
let pendingAll = false;
const flushRedraw = foundry.utils.debounce(() => {
  const only = pendingAll ? null : pendingRows;
  pendingRows = new Set();
  pendingAll = false;
  renderMeter(only);
}, 50);

function redrawSoon(actorId) {
  if (actorId) pendingRows.add(actorId);
  else pendingAll = true;
  flushRedraw();
}

for (const hook of ["createActor", "deleteActor"]) Hooks.on(hook, () => redrawSoon());
Hooks.on("updateActor", actor => redrawSoon(actor.id));
// Effects can sit on the actor or on one of its items; only those on a party member matter.
for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
  Hooks.on(hook, effect => {
    const actor = effect.parent?.documentName === "Actor" ? effect.parent : effect.parent?.parent;
    if (actor?.documentName === "Actor") redrawSoon(actor.id);
  });
}
for (const hook of ["createItem", "updateItem", "deleteItem"]) {
  Hooks.on(hook, item => {
    if (item.parent?.documentName !== "Actor") return;
    // The union talent changes who is ready with whom, so every row; a spell's castings only concern its owner.
    if (item.name === ENTRY_NAME) redrawSoon();
    else if (item.type === "spell") redrawSoon(item.parent.id);
  });
}

/* -------------------------------------------- */
/*  Skins                                        */
/* -------------------------------------------- */

function skinFolder() {
  const custom = game.settings.get(MODULE_ID, "unionSkinFolder")?.trim();
  if (custom) return custom.replace(/\/$/, "");
  const preset = game.settings.get(MODULE_ID, "unionSkin");
  return `modules/${MODULE_ID}/skins/${PRESET_SKINS[preset] ? preset : DEFAULT_SKIN}`;
}

async function loadSkin(folder) {
  if (skinCache.has(folder)) return skinCache.get(folder);
  const response = await fetch(`${folder}/skin.json`);
  if (!response.ok) throw new Error(`skin.json non trovato in ${folder}`);
  const skin = { ...(await response.json()), folder };
  skinCache.set(folder, skin);
  return skin;
}

async function resolveSkin() {
  const folder = skinFolder();
  try {
    return await loadSkin(folder);
  } catch (err) {
    console.warn(`${MODULE_ID} | ${err.message}, uso la skin predefinita`);
    return loadSkin(`modules/${MODULE_ID}/skins/${DEFAULT_SKIN}`);
  }
}

/**
 * The fill layer is revealed left to right through a slanted clip polygon.
 * `track.x0`/`x1` are where the fillable area starts/ends in the artwork (%),
 * `track.slant` is the horizontal skew of the cut edge (%).
 */
function fillClip({ x0 = 0, x1 = 100, slant = 0 }, fraction) {
  const p = (x0 - slant) + (x1 - x0 + 2 * slant) * fraction;
  return `polygon(0% 0%, ${p + slant}% 0%, ${p - slant}% 100%, 0% 100%)`;
}

function formatText(template, value, max) {
  const percent = Math.round((value / max) * 100);
  return template.replace("{value}", value).replace("{max}", max).replace("{percent}", percent);
}

/* -------------------------------------------- */
/*  Rendering                                    */
/* -------------------------------------------- */

let renderToken = 0;
// Kept by reference: while detached the stack lives in another window, where document.getElementById can't find it.
let stackEl = null;

/** `only` is a set of actor ids whose rows need redrawing; `null` redraws everything. */
async function renderMeter(only = null) {
  if (!game.ready) return;
  // A change to an actor outside the party (a token, an NPC) has nothing to redraw.
  if (only && !unionParty().some(actor => only.has(actor.id))) return;
  refreshHosts(only);
  const token = ++renderToken;
  const root = stackEl?.isConnected ? stackEl : document.getElementById(ROOT_ID);

  const party = unionParty();
  if (!game.settings.get(MODULE_ID, "unionShow") || !party.length) {
    if (root) closePopout(root);
    return root?.remove();
  }

  const skin = await resolveSkin();
  if (token !== renderToken) return;

  const scale = game.settings.get(MODULE_ID, "unionScale");
  const el = root ?? document.createElement("div");
  if (!root) {
    el.id = ROOT_ID;
    el.classList.add("cu-host", "cu-floating");
    document.body.appendChild(el);
  }
  stackEl = el;

  // Rows are rebuilt only when their structure changes, so the fill keeps its CSS transition.
  const key = cardsKey(skin, party);
  if (el.dataset.key !== key) {
    buildRows(el, skin, party);
    el.dataset.key = key;
  }
  // Every size in the stack derives from --cu-s, so changing the scale never needs a rebuild.
  el.style.setProperty("--cu-s", scale);
  updateRows(el, skin, party, only);
  if (!el.classList.contains("dragging")) fitToWindow(el, scale);

  // Width changes with the ready partners, so the position is re-clamped on every redraw.
  if (el.classList.contains("cu-detached")) return;
  if (hasSavedPosition() && !el.classList.contains("dragging")) {
    const { left, top } = game.settings.get(MODULE_ID, "unionPosition");
    placeWithin(el, left, top);
  } else if (!hasSavedPosition()) {
    // With the skin's own anchor, a tall stack (many PGs, details on) can poke out of the top.
    const box = el.getBoundingClientRect();
    if (box.top < GRIP_ROOM) placeWithin(el, box.left, GRIP_ROOM);
  }
}

function hasSavedPosition() {
  const { left, top } = game.settings.get(MODULE_ID, "unionPosition");
  return Number.isFinite(left) && Number.isFinite(top);
}

/** Variables the stylesheet reads from the skin; shared by the floating stack and every card host. */
function applySkinVars(el, skin) {
  // Artwork size and portrait size at scale 1; the stylesheet multiplies them by --cu-s.
  el.style.setProperty("--cu-w", `${skin.width}px`);
  el.style.setProperty("--cu-icon", `${skin.portraitSize ?? skin.height * 1.45}px`);
  // Lets a skin with a tilted bar lower the portrait to meet the bar's left end.
  el.style.setProperty("--cu-shift", `${skin.portraitShift ?? 0}px`);
  // Optional look of the party details: name font and the three HP colours.
  el.style.setProperty("--cu-font", skin.font ?? "inherit");
  el.style.setProperty("--cu-ready", skin.readyColor ?? "#2de0c4");
  for (const [name, fallback] of Object.entries(DEFAULT_SEGMENT_COLORS)) {
    el.style.setProperty(`--cu-seg-${name}`, skin.segments?.[name] ?? fallback);
  }
  el._hpColors = {};
  for (const [state, fallback] of Object.entries(DEFAULT_HP_COLORS)) {
    el.style.setProperty(`--cu-hp-${state}`, skin.hp?.[state] ?? fallback);
    el._hpColors[state] = parseHex(skin.hp?.[state] ?? fallback);
  }
  el.classList.toggle("editable", canEdit());
  el.classList.toggle("still-bubbles", skin.bubbleAnimation === false);
}

/** Key describing everything that changes a card's structure; values alone never need a rebuild. */
function cardsKey(skin, party, extras = false) {
  const details = Object.keys(DETAIL_SETTINGS).map(setting => game.settings.get(MODULE_ID, setting));
  const expanded = expandedIds();
  return [skin.folder, canEdit(), extras, ...details, ...party.map(a => `${a.id}:${a.name}:${a.img}:${canEditHp(a)}:${expanded.has(a.id)}`)].join("|");
}

function buildRows(el, skin, party) {
  const position = skin.position ?? {};

  el.style.cssText = "";
  applySkinVars(el, skin);
  // A saved position is applied (and clamped) by renderMeter once the stack has its real size.
  if (!hasSavedPosition()) {
    // Anchor to one edge per axis: top wins over bottom, right over left.
    if (position.top) el.style.top = position.top;
    else el.style.bottom = position.bottom ?? "120px";
    if (position.right) el.style.right = position.right;
    else el.style.left = position.left ?? "20px";
  }

  el.innerHTML = CARD_CHROME + cardsMarkup(skin, party);

  enableDrag(el, "unionPosition", () => renderMeter());
  enableResize(el, "unionScale", "unionPosition");
  el.querySelector(".cu-popout").addEventListener("click", () => popOut(el, "stack", () => renderMeter()));
  wireCards(el, skin);
}

/** One `.cu-row` card per PG. Values are filled in by updateRows; `extras` adds the effects and counters line. */
function cardsMarkup(skin, party, extras = false) {
  const asset = file => `${skin.folder}/${file}`;
  const text = skin.text ?? {};
  const align = text.align === "left" ? "0" : text.align === "right" ? "-100%" : "-50%";
  const textStyle = `font-size:calc(${text.size ?? 40}px * var(--cu-s));color:${text.color ?? "#fff"};font-family:${text.font ?? "inherit"};${text.stroke ? `-webkit-text-stroke:calc(${text.strokeWidth ?? 4}px * var(--cu-s)) ${text.stroke}` : ""}`;
  const [showStats, wantEffects, wantCounters, wantTags] = Object.keys(DETAIL_SETTINGS).map(setting => game.settings.get(MODULE_ID, setting));
  const expanded = expandedIds();

  return party.map(actor => {
    // Effects and counters only on the personal card or on a card the portrait expanded.
    const full = extras || expanded.has(actor.id);
    return `
    <div class="cu-row" data-actor-id="${actor.id}">
      <img class="cu-portrait" src="${actor.img}" draggable="false">
      <div class="cu-injured"></div>
      <div class="cu-status"></div>
      <div class="cu-main">
      ${skin.showName === false && !showStats ? "" : `<div class="cu-head">
        ${skin.showName === false ? "" : `<div class="cu-name" title="${Handlebars.Utils.escapeExpression(actor.name)}">${Handlebars.Utils.escapeExpression(showStats ? shortName(actor) : actor.name)}</div>`}
        ${showStats ? `<div class="cu-stats"></div>` : ""}
      </div>`}
      <div class="cu-hp">
        <div class="cu-hp-bar">
          <div class="cu-hp-fill"></div>
          <div class="cu-hp-shield"></div>
          <div class="cu-hp-text"></div>
          ${canEditHp(actor) && !skin.portraitControls ? `<div class="cu-hp-controls">
            <button type="button" data-hp="1" title="Danno (Maiusc: 5)">−</button>
            <button type="button" data-hp="-1" title="Cura (Maiusc: 5)">+</button>
          </div>` : ""}
        </div>
        ${showStats ? `<span class="cu-hr" data-tooltip="Rateo di Cura"></span><span class="cu-casts" hidden></span><span class="cu-signature" hidden></span><span class="cu-spec" hidden></span>` : ""}
      </div>
      <div class="cu-line">
        ${skin.segments?.icon ? `<img class="cu-union-icon" src="${skin.segments.icon}" title="Punti unione" draggable="false">` : ""}
        <div class="cu-meter" style="aspect-ratio:${skin.width} / ${skin.height}">
          ${skin.segments ? `<div class="cu-segments"></div>` : `<img class="cu-layer cu-frame" src="${asset(skin.frame)}" draggable="false">
          <img class="cu-layer cu-fill" src="${asset(skin.fill)}" draggable="false">`}
          ${skin.overlay ? `<img class="cu-layer cu-overlay" src="${asset(skin.overlay)}" draggable="false">` : ""}
          ${skin.showText === false ? "" : `<div class="cu-text" style="left:${text.x ?? 50}%;top:${text.y ?? 50}%;transform:translate(${align}, -50%);${textStyle}"></div>`}
          ${canEdit() && !skin.portraitControls ? `<div class="cu-controls">
            <button type="button" data-delta="-1">−</button>
            <button type="button" data-delta="1">+</button>
          </div>` : ""}
        </div>
        ${skin.segments?.label ? `<span class="cu-union-label">${skin.segments.label}</span>` : ""}
        <div class="cu-partners"></div>
      </div>
      ${wantTags ? `<div class="cu-tags"></div>` : ""}
      ${full && (wantEffects || wantCounters) ? `<div class="cu-extras"></div>` : ""}
      </div>
    </div>`;
  }).join("");
}

/** Click handlers of the cards inside `root` (the floating stack or a host). */
function wireCards(root, skin, extras = false) {
  // "+" heals (less damage taken), "−" hurts; the actor's own permissions decide who sees the buttons.
  root.querySelectorAll("[data-hp]").forEach(button => {
    button.addEventListener("click", event => {
      const actor = game.actors.get(button.closest(".cu-row").dataset.actorId);
      if (actor) changeDamage(actor, Number(button.dataset.hp) * (event.shiftKey ? 5 : 1), button.closest(".cu-row"));
    });
  });

  root.querySelectorAll("[data-delta]").forEach(button => {
    button.addEventListener("click", event => {
      const actorId = button.closest(".cu-row").dataset.actorId;
      const step = event.shiftKey ? 5 : 1;
      requestOperation("delta", { actorId, delta: Number(button.dataset.delta) * step });
    });
  });

  // Left click on a portrait expands that card (effects and counters) or folds it back; the personal card is always expanded.
  if (!extras) {
    root.querySelectorAll(".cu-portrait").forEach(portrait => {
      portrait.classList.add("expandable");
      portrait.dataset.tooltip = "Clic: mostra o nascondi effetti e contatori";
      portrait.addEventListener("click", () => toggleExpanded(portrait.closest(".cu-row").dataset.actorId));
    });
  }

  // "portraitControls" skins have no hover buttons either on the HP bar: left click heals, right click hurts (Shift: 5).
  if (skin.portraitControls) {
    root.querySelectorAll(".cu-hp-bar").forEach(bar => {
      const actor = game.actors.get(bar.closest(".cu-row").dataset.actorId);
      if (!actor || !canEditHp(actor)) return;
      bar.classList.add("adjustable");
      const nudge = (event, sign) => {
        event.preventDefault();
        changeDamage(actor, sign * (event.shiftKey ? 5 : 1), bar.closest(".cu-row"));
      };
      bar.addEventListener("click", event => nudge(event, -1));
      bar.addEventListener("contextmenu", event => nudge(event, 1));
    });
  }

  // "portraitControls" skins have no buttons: left click on the union bar (tiles and its icon) raises the points, right click lowers.
  // The ready partners sit beside the bar and keep their own click, so they are not part of this area.
  if (skin.portraitControls && canEdit()) {
    root.querySelectorAll(".cu-meter").forEach(meter => {
      const row = meter.closest(".cu-row");
      const areas = [meter, row.querySelector(".cu-union-icon")].filter(Boolean);
      const nudge = (event, sign) => {
        event.preventDefault();
        nudgePoints(row, skin, sign * (event.shiftKey ? 5 : 1));
      };
      for (const area of areas) {
        area.dataset.tooltip = "Clic sinistro: +1 PU, destro: −1 PU (Maiusc: 5)";
        area.classList.add("adjustable");
        area.addEventListener("click", event => nudge(event, 1));
        area.addEventListener("contextmenu", event => nudge(event, -1));
      }
    });
  }
}

/* -------------------------------------------- */
/*  Card hosts                                   */
/*  Any element can show the party cards: it     */
/*  registers here and is refreshed with the     */
/*  floating stack on every change.              */
/* -------------------------------------------- */

const hosts = new Map();

/**
 * Registers `host` and fills it with the party cards; `scaleSetting` names the client setting holding its scale.
 * Options: `extras` adds each card's effects and counters; `pick(party)` chooses which PGs get a card (default all);
 * `floating: { positionSetting }` adds the drag grip and resize handle, which then save to the host's own settings;
 * `onFilled(host)` runs after every redraw (to place a floating host).
 */
export function mountPartyCards(host, scaleSetting, options = {}) {
  host.classList.add("cu-host");
  host.classList.toggle("cu-floating", Boolean(options.floating));
  host.dataset.scaleSetting = scaleSetting;
  hosts.set(host, options);
  return fillHost(host, options);
}

/** Redraws every card host and the floating stack; for code that mounts its own host. */
export function refreshPartyCards() {
  return renderMeter();
}

function refreshHosts(only = null) {
  for (const [host, options] of hosts) {
    if (host.isConnected) fillHost(host, options, only);
    else hosts.delete(host);
  }
}

async function fillHost(host, options, only = null) {
  const party = unionParty();
  const shown = options.pick ? options.pick(party) : party;
  host.hidden = !shown.length;
  if (!shown.length) return;
  const skin = await resolveSkin();
  if (!host.isConnected) return;

  const extras = Boolean(options.extras);
  const key = cardsKey(skin, shown, extras);
  if (host.dataset.key !== key) {
    applySkinVars(host, skin);
    host.innerHTML = (options.floating ? CARD_CHROME : "") + cardsMarkup(skin, shown, extras);
    if (options.floating) {
      enableDrag(host, options.floating.positionSetting, () => { delete host.dataset.key; fillHost(host, options); });
      enableResize(host, host.dataset.scaleSetting, options.floating.positionSetting);
      host.querySelector(".cu-popout").addEventListener("click", () => popOut(host, host.id, () => renderMeter()));
    }
    wireCards(host, skin, extras);
    host.dataset.key = key;
  }
  host.style.setProperty("--cu-s", game.settings.get(MODULE_ID, host.dataset.scaleSetting));
  // Partners are worked out against the whole party, even when this host shows only some of its members.
  updateRows(host, skin, party, only);
  if (options.floating && !host.classList.contains("dragging")) fitToWindow(host, game.settings.get(MODULE_ID, host.dataset.scaleSetting));
  options.onFilled?.(host);
}

// Room kept above and below the stack so its grips never leave the screen.
const GRIP_ROOM = 22;
const SCALE = { min: 0.3, max: 2 };

/**
 * A floating card never grows beyond the window: with a saved scale that is too large (or a smaller window)
 * the resize handle would end up out of reach. Only the applied scale shrinks; the saved one is untouched.
 */
function fitToWindow(el, scale, limits = {}) {
  if (el.classList.contains("cu-detached")) return scale;
  const maxHeight = limits.height ?? window.innerHeight - GRIP_ROOM * 2;
  const maxWidth = limits.width ?? window.innerWidth - 8;
  let applied = scale;
  el.style.setProperty("--cu-s", applied);
  // Part of the size is fixed (gaps, borders), so a few passes converge instead of one proportional step.
  for (let pass = 0; pass < 4; pass++) {
    const factor = Math.min(maxHeight / (el.offsetHeight || 1), maxWidth / (el.offsetWidth || 1));
    if (factor >= 1 || applied <= 0.2) break;
    applied = Math.max(0.2, applied * factor * 0.98);
    el.style.setProperty("--cu-s", applied);
  }
  return applied;
}

/** Places the stack at left/top, kept entirely inside the window (grips included). */
export function placeWithin(el, left, top) {
  const maxLeft = Math.max(0, window.innerWidth - el.offsetWidth);
  const maxTop = Math.max(GRIP_ROOM, window.innerHeight - el.offsetHeight - GRIP_ROOM);
  el.style.right = el.style.bottom = "auto";
  el.style.left = `${Math.min(Math.max(0, left), maxLeft)}px`;
  el.style.top = `${Math.min(Math.max(GRIP_ROOM, top), maxTop)}px`;
}

/** The grip drags the whole stack; the position is saved per client (in `positionSetting`) when the drag ends. */
function enableDrag(el, positionSetting, onReset) {
  const grip = el.querySelector(".cu-grip");

  grip.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const box = el.getBoundingClientRect();
    const dx = event.clientX - box.left;
    const dy = event.clientY - box.top;
    grip.setPointerCapture(event.pointerId);
    el.classList.add("dragging");

    const move = e => placeWithin(el, e.clientX - dx, e.clientY - dy);
    const stop = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", stop);
      grip.removeEventListener("pointercancel", stop);
      el.classList.remove("dragging");
      game.settings.set(MODULE_ID, positionSetting, {
        left: Math.round(el.getBoundingClientRect().left),
        top: Math.round(el.getBoundingClientRect().top)
      });
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", stop);
    grip.addEventListener("pointercancel", stop);
  });

  grip.addEventListener("dblclick", async () => {
    await game.settings.set(MODULE_ID, positionSetting, {});
    delete el.dataset.key;
    onReset();
  });
}

/**
 * The corner handle resizes the whole stack with its proportions locked. The stack's size comes from
 * the --cu-s variable, so dragging just updates it live: what you see is the final layout.
 */
function enableResize(el, scaleSetting, positionSetting) {
  const handle = el.querySelector(".cu-resize");

  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const box = el.getBoundingClientRect();
    const startScale = game.settings.get(MODULE_ID, scaleSetting);
    let scale = startScale;

    // Some of the width is fixed (gaps, borders), so measure how it grows with the scale
    // and make the handle follow the pointer instead of assuming a pure proportion.
    el.style.setProperty("--cu-s", startScale / 2);
    const halfWidth = el.offsetWidth;
    el.style.setProperty("--cu-s", startScale);
    const slope = (box.width - halfWidth) / (startScale / 2);

    // Pin the top-left corner so the stack grows right and down from where it is.
    el.style.right = el.style.bottom = "auto";
    el.style.left = `${box.left}px`;
    el.style.top = `${box.top}px`;
    handle.setPointerCapture(event.pointerId);
    el.classList.add("dragging");

    const move = e => {
      scale = startScale + (e.clientX - box.left - box.width) / slope;
      scale = Math.round(Math.min(SCALE.max, Math.max(SCALE.min, scale)) * 100) / 100;
      // It grows only as far as it fits from where it sits, and stops there: what is saved is what is shown,
      // so nothing snaps back when the handle is released.
      scale = Math.floor(fitToWindow(el, scale, {
        width: window.innerWidth - box.left - 4,
        height: window.innerHeight - box.top - GRIP_ROOM
      }) * 100) / 100;
      el.style.setProperty("--cu-s", scale);
    };
    const stop = async () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      el.classList.remove("dragging");
      await game.settings.set(MODULE_ID, positionSetting, { left: Math.round(box.left), top: Math.round(box.top) });
      await game.settings.set(MODULE_ID, scaleSetting, scale);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  });

  handle.addEventListener("dblclick", () => game.settings.set(MODULE_ID, scaleSetting, game.settings.settings.get(`${MODULE_ID}.${scaleSetting}`).default));
}

/** Draws the union bar for `value` points; also what the next click counts from (see nudgePoints). */
function paintPoints(row, skin, value, max) {
  row.dataset.pu = value;
  if (skin.segments) updateSegments(row, value, max, skin.segments.gradient);
  else row.querySelector(".cu-fill").style.clipPath = fillClip(skin.track ?? {}, value / max);
  const label = row.querySelector(".cu-text");
  if (label) label.textContent = formatText(skin.text?.template ?? "{percent}%", value, max);

  const meter = row.querySelector(".cu-meter");
  if (value !== Number(meter.dataset.value ?? value)) {
    meter.classList.remove("pulse");
    void meter.offsetWidth;
    meter.classList.add("pulse");
  }
  meter.dataset.value = value;
}

/**
 * Click on the union bar: the bar moves at once and the operation follows (through the GM for other
 * users), so clicks feel instant and quick successive clicks add up on the displayed value.
 */
function nudgePoints(row, skin, delta) {
  const actor = unionParty().find(candidate => candidate.id === row.dataset.actorId);
  if (!actor) return;
  const max = maxOf(actor);
  const base = row.dataset.pu !== undefined ? Number(row.dataset.pu) : Math.min(max, pointsOf(actor));
  const value = Math.min(max, Math.max(0, base + delta));
  if (value === base) return;
  paintPoints(row, skin, value, max);
  requestOperation("delta", { actorId: actor.id, delta: value - base });
}

function updateRows(el, skin, party, only = null) {
  const state = getState();

  for (const actor of party) {
    if (only && !only.has(actor.id)) continue;
    const row = el.querySelector(`.cu-row[data-actor-id="${actor.id}"]`);
    if (!row) continue;
    const max = maxOf(actor);
    const value = Math.min(max, pointsOf(actor));

    updateHp(row, actor);
    updateStats(row, actor);
    updateExtras(row, actor);
    updateStatus(row, actor);
    updateTags(row, actor);

    paintPoints(row, skin, value, max);

    // Partners ready to perform a union move with this PG.
    const partners = row.querySelector(".cu-partners");
    syncChildren(partners, party
      .filter(other => isReady(state, actor, other))
      .map(other => {
        const icon = document.createElement("img");
        icon.className = "cu-partner";
        icon.src = bubbleImage(other);
        icon.draggable = false;
        icon.dataset.partner = other.id;
        icon.dataset.tooltip = `${other.name} — mossa unione (${pairCost(actor.id, other.id)} PU)`;
        if (canEdit()) {
          icon.classList.add("clickable");
          icon.addEventListener("click", () => requestOperation("use", { a: actor.id, b: other.id }));
        }
        return icon;
      }));
  }
}

/* -------------------------------------------- */
/*  Party details (HP, stats, effects, counters) */
/* -------------------------------------------- */

/** The bar shows what is left: full when unhurt, amber from the system's "injured" mark, red when down. */
function updateHp(row, actor) {
  // A click of ours is still being written: the bar already shows it, and the data that arrives is older.
  if (damageQueues.get(actor.id)?.busy) return;
  const { value, max } = actor.system.characteristics.health;
  paintHp(row, Math.min(max, Math.max(0, value)), max);
}

function parseHex(hex) {
  const value = hex.trim().replace("#", "");
  const full = value.length === 3 ? [...value].map(c => c + c).join("") : value;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
}

/**
 * Like the bars on tokens, the colour follows the percentage instead of jumping between states:
 * the skin's "down" colour at 0, "injured" at half, "ok" at full, blended in between.
 */
function hpColor(bar, pct) {
  // The three colours are parsed once per card host, when the skin is applied (see applySkinVars): asking the browser
  // for the computed style of every bar forced a layout for each row of each redraw.
  const colors = bar.closest(".cu-host")?._hpColors;
  const pick = state => colors?.[state] ?? parseHex(DEFAULT_HP_COLORS[state]);
  const [from, to, t] = pct >= 0.5 ? [pick("injured"), pick("ok"), (pct - 0.5) * 2] : [pick("down"), pick("injured"), pct * 2];
  return `rgb(${from.map((c, i) => Math.round(c + (to[i] - c) * t)).join(" ")})`;
}

/** Draws the bar for a given damage; also what the next click counts from (see changeDamage). */
function paintHp(row, damage, max, temp = tempHp(game.actors.get(row.dataset.actorId))) {
  row.dataset.dmg = damage;
  row.dataset.temp = temp;
  const left = Math.max(0, max - damage);
  const bar = row.querySelector(".cu-hp");
  // Temporary HP / shield: a bluish segment after the HP; the bar widens its scale when HP + shield pass the maximum.
  const scale = Math.max(max, left + temp);
  bar.querySelector(".cu-hp-fill").style.width = scale ? `${(left / scale) * 100}%` : "0";
  const shield = bar.querySelector(".cu-hp-shield");
  if (shield) {
    shield.style.left = scale ? `${(left / scale) * 100}%` : "0";
    shield.style.width = scale ? `${(temp / scale) * 100}%` : "0";
  }
  bar.style.setProperty("--cu-hp-color", hpColor(bar, max ? left / max : 0));
  // Only the current value on screen; the maximum stays in the tooltip.
  const text = bar.querySelector(".cu-hp-text");
  text.textContent = `PV ${left}`;
  if (temp) {
    const extra = document.createElement("span");
    extra.className = "cu-hp-temp";
    extra.textContent = `+${temp}`;
    text.append(extra);
  }
  bar.dataset.tooltip = `${left} / ${max}` + (temp ? ` (+${temp} ${game.i18n.localize("CLUSTERSOMNIA.TempHpFull")})` : "") + (bar.querySelector(".cu-hp-bar.adjustable") ? " — clic sinistro: +1, destro: −1 (Maiusc: 5)" : "");
  bar.classList.toggle("injured", max > 0 && damage >= max / 2);
  bar.classList.toggle("down", left === 0);
}

// The label is dimmer than the number, so the value is what the eye lands on.
function statLabel(label) {
  const span = document.createElement("span");
  span.className = "cu-stat-label";
  span.textContent = `${label} `;
  return span;
}

/**
 * How many spell castings the PG has left, all spells together and whatever their rank. In the system
 * `castings.value` is the number of castings *used* (it goes up with every cast and back to 0 on rest), so what is
 * left is `max - value` for each spell. A PG with no spells shows nothing.
 */
function updateCastings(row, actor) {
  const element = row.querySelector(".cu-casts");
  if (!element) return;
  const spells = actor.items.filter(item => item.type === "spell");
  element.hidden = !spells.length;
  if (!spells.length) return;
  const left = spells.reduce((sum, spell) => {
    const max = Number(spell.system.castings?.max) || 0;
    const used = Number(spell.system.castings?.value) || 0;
    return sum + Math.max(0, max - used);
  }, 0);
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-wand-sparkles";
  syncChildren(element, [icon, String(left)]);
  element.classList.toggle("empty", left === 0);
  element.dataset.tooltip = `Magie rimaste: ${left}`;
}

/**
 * The PG's specialization, named after its highest attribute, beside the spell counter: an icon and a short name
 * (Rap, Vig, Arc, Spi). A PG has one, so a tie goes to the first attribute in the table (see specializationOf).
 * Nothing is drawn when all four attributes are equal.
 */
function updateSpecialization(row, actor) {
  const element = row.querySelector(".cu-spec");
  if (!element) return;
  const specialization = specializationOf(actor);
  element.hidden = !specialization;
  if (!specialization) return;
  const part = document.createElement("span");
  const icon = document.createElement("i");
  icon.className = specialization.icon;
  part.append(icon, specialization.short);
  syncChildren(element, [part]);
  element.dataset.tooltip = `Specializzazione: ${specialization.name} (${specialization.stat} ${specialization.value})`;
}

/**
 * A small emblem next to the HP bar for a PG that has one (Zoe's umbrella): just an icon, with a name that appears
 * on hover. It comes from the actor flag `clustersomnia.signature` = `{ icon: "fa-solid fa-umbrella", name: "..." }`
 * and nothing is drawn for a PG without it.
 */
function updateSignature(row, actor) {
  const element = row.querySelector(".cu-signature");
  if (!element) return;
  const signature = actor.getFlag(MODULE_ID, "signature");
  const shown = signature?.image || signature?.icon;
  element.hidden = !shown;
  if (!shown) return;
  // An image path wins; otherwise `icon` is a FontAwesome class string.
  if (signature.image) syncChildren(element, [miniIcon(signature.image)]);
  else {
    const icon = document.createElement("i");
    icon.className = signature.icon;
    syncChildren(element, [icon]);
  }
  element.dataset.tooltip = signature.name ?? "";
}

function updateStats(row, actor) {
  const container = row.querySelector(".cu-stats");
  if (!container) return;
  const { defense, speed, health, insanity, corruption } = actor.system.characteristics;
  // Short text labels as in the party sketch: what the table asks for most during a fight.
  // Insanity (called Incubo) and corruption (called Corallo Bianco, "COR") show only the current value; the maximum is in the tooltip.
  const stats = [
    { label: "DEF", title: "Difesa", text: defense },
    { label: "SPD", title: "Velocità", text: speed },
    { label: "INC", title: `Incubo ${insanity.value} / ${insanity.max}`, text: insanity.value },
    { label: "COR", title: "Corallo Bianco", text: corruption.value }
  ];
  const hr = row.querySelector(".cu-hr");
  if (hr) syncChildren(hr, [statLabel("HR"), String(health.healingrate)]);
  updateCastings(row, actor);
  updateSpecialization(row, actor);
  updateSignature(row, actor);
  syncChildren(container, stats.map(({ label, title, text }) => {
    const chip = document.createElement("span");
    chip.className = "cu-stat";
    chip.dataset.tooltip = title;
    chip.replaceChildren(statLabel(label), String(text));
    return chip;
  }));
}

const MAX_EFFECT_ICONS = 6;

// Wide enough for every category in both directions: the row wraps rather than hiding a tag behind a +N.
const MAX_TAGS = 24;
const TAGS_PER_ROW = 7;

/** The quick-glance tags of a compact card: a label and stacked arrows, coloured by tier, no values. */
function updateTags(row, actor) {
  const container = row.querySelector(".cu-tags");
  if (!container) return;
  const tags = effectTags(actor);
  const chips = tags.slice(0, MAX_TAGS).map(tag => {
    const chip = document.createElement("span");
    chip.className = `cu-tag ${tag.dir} tier-${tag.tier}${tag.special ? " special" : ""}`;
    const level = tag.dir === "up" ? "Up" : "Down";
    // The sources are listed with how many times each counts, so the tooltip explains the number of arrows.
    chip.dataset.tooltip = `${tag.label} ${level}${tag.special ? " MAX" : ""} (${tag.name}) ×${tag.steps} — ${tag.sources.join(", ")}`;
    const arrows = document.createElement("span");
    arrows.className = "cu-tag-arrows";
    for (let i = 0; i < tag.arrows; i++) arrows.append(document.createElement("i"));
    // The last step swaps the arrows for an emblem and lets the label animate (see .special in the stylesheet).
    if (tag.special) {
      const label = document.createElement("span");
      label.className = "cu-tag-label";
      label.textContent = tag.label;
      const emblem = document.createElement("i");
      emblem.className = "cu-tag-emblem";
      chip.append(label, emblem);
    } else {
      chip.append(tag.label, arrows);
    }
    return chip;
  });
  if (tags.length > MAX_TAGS) {
    const more = document.createElement("span");
    more.className = "cu-tag more";
    more.textContent = `+${tags.length - MAX_TAGS}`;
    more.dataset.tooltip = tags.slice(MAX_TAGS).map(tag => `${tag.label} ${tag.dir === "up" ? "Up" : "Down"}`).join(", ");
    chips.push(more);
  }
  syncChildren(container, chips);
  container.hidden = !chips.length;
  // At most TAGS_PER_ROW to a row; more than that and the tags are split into equal rows (8 become 4 + 4, not 7 + 1).
  const rows = Math.ceil(chips.length / TAGS_PER_ROW);
  container.style.setProperty("--tag-cols", Math.max(1, Math.ceil(chips.length / Math.max(1, rows))));
}

/** Two letters standing for a counter that has no icon: initials of the first two words, or the first two letters. */
function counterInitials(name = "") {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/**
 * The status icons of a token (Injured, Prone, anything temporary on the actor) drawn around the portrait the way
 * the token shows them over its picture: small round icons along the left edge, from the top down. More than fit
 * end in a "+N". The effects picked in the Tracker are not here, they stay in the extras line.
 */
const MAX_STATUS_ICONS = 6;
const STATUS_ARC = { start: 235, step: -28 }; // degrees: 0 is the right, 90 the bottom; so from the top left, down the left side

function updateStatus(row, actor) {
  const container = row.querySelector(".cu-status");
  if (!container) return;
  const children = [];
  if (game.settings.get(MODULE_ID, "unionShowEffects")) {
    const effects = tokenEffects(actor);
    const shown = effects.length > MAX_STATUS_ICONS ? MAX_STATUS_ICONS - 1 : effects.length;
    effects.slice(0, shown).forEach((effect, index) => {
      const icon = document.createElement("img");
      icon.className = "cu-status-icon";
      icon.src = effect.img;
      icon.draggable = false;
      icon.dataset.tooltip = effect.name;
      icon.style.setProperty("--a", `${STATUS_ARC.start + STATUS_ARC.step * index}deg`);
      children.push(icon);
    });
    if (effects.length > shown) {
      const more = document.createElement("span");
      more.className = "cu-status-icon cu-status-more";
      more.textContent = `+${effects.length - shown}`;
      more.dataset.tooltip = effects.slice(shown).map(effect => effect.name).join(", ");
      more.style.setProperty("--a", `${STATUS_ARC.start + STATUS_ARC.step * shown}deg`);
      children.push(more);
    }
  }
  syncChildren(container, children);
}

function updateExtras(row, actor) {
  const container = row.querySelector(".cu-extras");
  if (!container) return;
  const children = [];
  if (game.settings.get(MODULE_ID, "unionShowEffects")) {
    const active = displayedEffects(actor).filter(effect => !effect.disabled);
    for (const effect of active.slice(0, MAX_EFFECT_ICONS)) {
      const icon = document.createElement("img");
      icon.className = "cu-effect";
      icon.src = effect.img;
      icon.draggable = false;
      icon.dataset.tooltip = effect.name;
      children.push(icon);
    }
    // A long list would make this row taller than the rest of the stack.
    if (active.length > MAX_EFFECT_ICONS) {
      const more = document.createElement("span");
      more.className = "cu-counter";
      more.textContent = `+${active.length - MAX_EFFECT_ICONS}`;
      more.dataset.tooltip = active.slice(MAX_EFFECT_ICONS).map(effect => effect.name).join(", ");
      children.push(more);
    }
  }

  if (game.settings.get(MODULE_ID, "unionShowCounters")) {
    // Every counter is an icon with its current value in a badge on the corner (the total stays in the Tracker).
    // Without an icon the box shows the initials of the name, so counters remain tell-apart-able.
    for (const counter of actor.getFlag(MODULE_ID, "counters") ?? []) {
      const wrap = document.createElement("span");
      wrap.className = "cu-counter-icon";
      wrap.classList.toggle("empty", !counter.value);
      wrap.dataset.tooltip = `${counter.name}: ${counter.value}`;
      if (counter.icon) {
        const image = document.createElement("img");
        image.src = counter.icon;
        image.draggable = false;
        wrap.append(image);
      } else {
        const initials = document.createElement("span");
        initials.className = "cu-counter-initials";
        initials.textContent = counterInitials(counter.name);
        wrap.append(initials);
      }
      const badge = document.createElement("span");
      badge.className = "cu-counter-badge";
      badge.textContent = counter.value;
      wrap.append(badge);
      children.push(wrap);
    }
  }

  syncChildren(container, children);
  container.hidden = !children.length;
}

/**
 * Skins with "segments" draw the union bar as one slanted tile per point instead of a fill image,
 * rebuilt only when the maximum changes so the lit state can transition.
 */
const MAX_SEGMENTS = 20;

/** Colour of tile `index` of `count` along the skin's gradient stops (blended in sRGB, first tile = first stop). */
function segmentColor(stops, index, count) {
  const colors = stops.map(parseHex);
  const position = count > 1 ? (index / (count - 1)) * (colors.length - 1) : 0;
  const i = Math.min(colors.length - 2, Math.floor(position));
  const t = position - i;
  const mix = (a, b, amount) => a.map((c, k) => Math.round(c + (b[k] - c) * amount));
  const base = colors.length > 1 ? mix(colors[i], colors[i + 1], t) : colors[0];
  return { base: `rgb(${base.join(" ")})`, light: `rgb(${mix(base, [255, 255, 255], 0.5).join(" ")})` };
}

function updateSegments(row, value, max, gradient) {
  const container = row.querySelector(".cu-segments");
  const count = Math.min(MAX_SEGMENTS, max);
  if (container.children.length !== count) {
    container.replaceChildren(...Array.from({ length: count }, (_, index) => {
      const tile = document.createElement("i");
      tile.className = "cu-segment";
      // A skin with a gradient gives every tile its own colour, like the token bars do for HP.
      if (gradient?.length) {
        const { base, light } = segmentColor(gradient, index, count);
        tile.style.setProperty("--seg-c", base);
        tile.style.setProperty("--seg-hi", light);
      }
      return tile;
    }));
  }
  const lit = Math.round((value / max) * count);
  [...container.children].forEach((tile, index) => tile.classList.toggle("on", index < lit));
}
