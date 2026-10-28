import { UnityConfigApp } from "./unity-config-app.js";

const MODULE_ID = "clustersomnia";
const SOCKET_CHANNEL = "module.clustersomnia";
const ROOT_ID = "clustersomnia-unity";
const PRESET_SKINS = { persona: "Persona", minimal: "Minimal" };
const DEFAULT_SKIN = "persona";

const skinCache = new Map();

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
export function unityItem(actor) {
  return actor.items.find(item => item.type === "talent" && item.name === ENTRY_NAME);
}

function pointsOf(actor) {
  return Number(unityItem(actor)?.system.uses?.value) || 0;
}

function maxOf(actor) {
  return Number(unityItem(actor)?.system.uses?.max) || FALLBACK_MAX;
}

export function pairKey(a, b) {
  return [a, b].sort().join("|");
}

/** PCs that take part in the meter: player-owned characters carrying the "Punti Unione" talent. */
export function unityParty() {
  return game.actors
    .filter(actor => actor.type === "character" && actor.hasPlayerOwner && unityItem(actor))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function pairCost(a, b) {
  const costs = game.settings.get(MODULE_ID, "unityCosts");
  const cost = costs[pairKey(a, b)] ?? game.settings.get(MODULE_ID, "unityDefaultCost");
  return Math.max(1, cost);
}

function getState() {
  return { used: game.settings.get(MODULE_ID, "unityState").used ?? [] };
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

  game.settings.register(MODULE_ID, "unityState", {
    scope: "world", config: false, type: Object, default: { used: [] }, onChange: redraw
  });
  game.settings.register(MODULE_ID, "unityCosts", {
    scope: "world", config: false, type: Object, default: {}, onChange: redraw
  });
  game.settings.register(MODULE_ID, "unityDefaultCost", {
    name: "Mossa unione: costo predefinito",
    hint: "PU richiesti a entrambi i PG, salvo costo specifico per la coppia (menu qui sotto).",
    scope: "world", config: true, type: Number, default: 5,
    range: { min: 1, max: 100, step: 1 }, onChange: redraw
  });
  game.settings.registerMenu(MODULE_ID, "unityConfig", {
    name: "Mossa unione: costi e reset",
    label: "Configura",
    hint: "Costo per ogni coppia di PG e azzeramento di punti e mosse usate.",
    icon: "fas fa-link",
    type: UnityConfigApp,
    restricted: true
  });
  game.settings.register(MODULE_ID, "unitySkin", {
    name: "Punti unione: skin",
    hint: "Skin del meter, uguale per tutti i giocatori.",
    scope: "world", config: true, type: String, default: DEFAULT_SKIN,
    choices: PRESET_SKINS, onChange: redraw
  });
  game.settings.register(MODULE_ID, "unitySkinFolder", {
    name: "Punti unione: cartella skin personalizzata",
    hint: "Cartella con skin.json e le immagini. Se impostata, ha la precedenza sulla skin scelta sopra.",
    scope: "world", config: true, type: String, default: "", filePicker: "folder", onChange: redraw
  });
  game.settings.register(MODULE_ID, "unityShow", {
    name: "Mostra i meter dei punti unione",
    scope: "client", config: true, type: Boolean, default: true, onChange: redraw
  });
  game.settings.register(MODULE_ID, "unityScale", {
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

const OPERATIONS = {
  async delta(state, { actorId, delta }) {
    const actor = unityParty().find(candidate => candidate.id === actorId);
    if (!actor) return false;
    await setPoints(actor, pointsOf(actor) + delta);
    return false;
  },
  async use(state, { a, b }) {
    const [actorA, actorB] = [a, b].map(id => unityParty().find(candidate => candidate.id === id));
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
  return unityItem(actor).update({ "system.uses.value": Math.min(maxOf(actor), Math.max(0, value)) });
}

let queue = Promise.resolve();

function applyOperation(op, args) {
  queue = queue.then(async () => {
    const state = foundry.utils.deepClone(getState());
    if (await OPERATIONS[op](state, args)) await game.settings.set(MODULE_ID, "unityState", state);
  }).catch(err => console.error(`${MODULE_ID} | ${err.message}`));
  return queue;
}

export function requestOperation(op, args = {}) {
  if (game.user.isGM) return applyOperation(op, args);
  if (!game.users.activeGM) return ui.notifications.warn(`${MODULE_ID} | Nessun GM connesso: operazione annullata.`);
  game.socket.emit(SOCKET_CHANNEL, { type: "unity-op", op, args, userId: game.user.id });
}

Hooks.once("ready", () => {
  game.socket.on(SOCKET_CHANNEL, message => {
    if (message.type !== "unity-op") return;
    if (game.users.activeGM?.id !== game.user.id) return;
    if (!canEdit(game.users.get(message.userId))) return;
    // Players may only nudge points and spend ready pairs; resets stay with the GM.
    if (!["delta", "use"].includes(message.op)) return;
    if (message.op === "delta" && !Number.isFinite(message.args?.delta)) return;
    applyOperation(message.op, message.args);
  });
  renderMeter();
});

// A fight ending clears the pairs used in it.
Hooks.on("deleteCombat", () => {
  if (game.users.activeGM?.id === game.user.id) applyOperation("resetUsed");
});

const redrawSoon = foundry.utils.debounce(() => renderMeter(), 50);
for (const hook of ["createActor", "updateActor", "deleteActor"]) Hooks.on(hook, redrawSoon);
for (const hook of ["createItem", "updateItem", "deleteItem"]) {
  Hooks.on(hook, item => {
    if (item.name === ENTRY_NAME && item.parent?.documentName === "Actor") redrawSoon();
  });
}

/* -------------------------------------------- */
/*  Skins                                        */
/* -------------------------------------------- */

function skinFolder() {
  const custom = game.settings.get(MODULE_ID, "unitySkinFolder")?.trim();
  if (custom) return custom.replace(/\/$/, "");
  const preset = game.settings.get(MODULE_ID, "unitySkin");
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

async function renderMeter() {
  if (!game.ready) return;
  const token = ++renderToken;
  const root = document.getElementById(ROOT_ID);

  const party = unityParty();
  if (!game.settings.get(MODULE_ID, "unityShow") || !party.length) return root?.remove();

  const skin = await resolveSkin();
  if (token !== renderToken) return;

  const scale = game.settings.get(MODULE_ID, "unityScale");
  const el = root ?? document.createElement("div");
  if (!root) {
    el.id = ROOT_ID;
    document.body.appendChild(el);
  }

  // Rows are rebuilt only when their structure changes, so the fill keeps its CSS transition.
  const key = [skin.folder, scale, canEdit(), ...party.map(a => `${a.id}:${a.name}:${a.img}`)].join("|");
  if (el.dataset.key !== key) {
    buildRows(el, skin, party, scale);
    el.dataset.key = key;
  }
  updateRows(el, skin, party, scale);
}

function buildRows(el, skin, party, scale) {
  const position = skin.position ?? {};
  const asset = file => `${skin.folder}/${file}`;
  const text = skin.text ?? {};
  const align = text.align === "left" ? "0" : text.align === "right" ? "-100%" : "-50%";

  el.style.cssText = "";
  el.classList.toggle("editable", canEdit());
  // Anchor to one edge per axis: top wins over bottom, right over left.
  if (position.top) el.style.top = position.top;
  else el.style.bottom = position.bottom ?? "120px";
  if (position.right) el.style.right = position.right;
  else el.style.left = position.left ?? "20px";

  el.innerHTML = party.map(actor => `
    <div class="cu-row" data-actor-id="${actor.id}">
      <div class="cu-name">${Handlebars.Utils.escapeExpression(actor.name)}</div>
      <div class="cu-line">
        <div class="cu-meter" style="width:${skin.width * scale}px;aspect-ratio:${skin.width} / ${skin.height}">
          <img class="cu-layer cu-frame" src="${asset(skin.frame)}" draggable="false">
          <img class="cu-layer cu-fill" src="${asset(skin.fill)}" draggable="false">
          ${skin.overlay ? `<img class="cu-layer cu-overlay" src="${asset(skin.overlay)}" draggable="false">` : ""}
          <div class="cu-text" style="left:${text.x ?? 50}%;top:${text.y ?? 50}%;font-size:${(text.size ?? 40) * scale}px;color:${text.color ?? "#fff"};font-family:${text.font ?? "inherit"};transform:translate(${align}, -50%);${text.stroke ? `-webkit-text-stroke:${(text.strokeWidth ?? 4) * scale}px ${text.stroke}` : ""}"></div>
          ${canEdit() ? `<div class="cu-controls">
            <button type="button" data-delta="-1">−</button>
            <button type="button" data-delta="1">+</button>
          </div>` : ""}
        </div>
        <div class="cu-partners"></div>
      </div>
    </div>`).join("");

  el.querySelectorAll("[data-delta]").forEach(button => {
    button.addEventListener("click", event => {
      const actorId = button.closest(".cu-row").dataset.actorId;
      const step = event.shiftKey ? 5 : 1;
      requestOperation("delta", { actorId, delta: Number(button.dataset.delta) * step });
    });
  });
}

function updateRows(el, skin, party, scale) {
  const state = getState();
  const iconSize = Math.max(24, Math.round(64 * scale));

  for (const actor of party) {
    const row = el.querySelector(`.cu-row[data-actor-id="${actor.id}"]`);
    if (!row) continue;
    const max = maxOf(actor);
    const value = Math.min(max, pointsOf(actor));

    row.querySelector(".cu-fill").style.clipPath = fillClip(skin.track ?? {}, value / max);
    row.querySelector(".cu-text").textContent = formatText(skin.text?.template ?? "{percent}%", value, max);

    const meter = row.querySelector(".cu-meter");
    if (value !== Number(meter.dataset.value ?? value)) {
      meter.classList.remove("pulse");
      void meter.offsetWidth;
      meter.classList.add("pulse");
    }
    meter.dataset.value = value;

    // Partners ready to perform a union move with this PG.
    const partners = row.querySelector(".cu-partners");
    partners.replaceChildren(...party
      .filter(other => isReady(state, actor, other))
      .map(other => {
        const icon = document.createElement("img");
        icon.className = "cu-partner";
        icon.src = other.img;
        icon.draggable = false;
        icon.style.width = icon.style.height = `${iconSize}px`;
        icon.dataset.tooltip = `${other.name} — mossa unione (${pairCost(actor.id, other.id)} PU)`;
        if (canEdit()) {
          icon.classList.add("clickable");
          icon.addEventListener("click", () => requestOperation("use", { a: actor.id, b: other.id }));
        }
        return icon;
      }));
  }
}
