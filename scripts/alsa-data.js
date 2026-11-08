// Genesis mode: the data side. The elements Alsa can pick while Genesis is on, their defaults, what the table
// changed in the config window, and when the mode is on.

export const MODULE_ID = "clustersomnia";

/** The six elements, in the order the picker shows them. `{nome}` in a name stands for the attack's own name. */
export const GENESIS_DEFAULTS = [
  {
    id: "fire", label: "Fuoco", color: "#e8572a",
    icon: "icons/magic/fire/explosion-fireball-large-orange.webp",
    name: "{nome} di Fuoco", damageType: "Fuoco",
    description: "<p>Il colpo avvampa di fuoco elementale.</p>"
  },
  {
    id: "ice", label: "Ghiaccio", color: "#6fc3e6",
    icon: "icons/magic/water/barrier-ice-crystal-wall-faceted-blue.webp",
    name: "{nome} di Ghiaccio", damageType: "Ghiaccio",
    description: "<p>Il colpo porta con sé un gelo tagliente.</p>"
  },
  {
    id: "water", label: "Acqua", color: "#3a86e0",
    icon: "icons/magic/water/wave-water-blue.webp",
    name: "{nome} d'Acqua", damageType: "Acqua",
    description: "<p>Il colpo si abbatte come un'onda.</p>"
  },
  {
    id: "earth", label: "Terra", color: "#9b7a4a",
    icon: "icons/magic/earth/barrier-stone-explosion-debris.webp",
    name: "{nome} di Terra", damageType: "Terra",
    description: "<p>Il colpo ha il peso della roccia.</p>"
  },
  {
    id: "air", label: "Aria", color: "#8fd0b4",
    icon: "icons/magic/air/fog-gas-smoke-swirling-white.webp",
    name: "{nome} d'Aria", damageType: "Aria",
    description: "<p>Il colpo taglia l'aria come una raffica.</p>"
  },
  {
    id: "lightning", label: "Tuono", color: "#f0c82e",
    icon: "icons/magic/lightning/bolt-forked-blue-yellow.webp",
    name: "{nome} di Tuono", damageType: "Tuono",
    description: "<p>Il colpo crepita di fulmini.</p>"
  }
];

/**
 * The four options of the Gigantomachia mode, the sister of Genesis: with Zoe's blood, Alsa can attack in a special
 * way. The first three change the attack's statistics (see the card in alsa.js) and have their own name, icon and
 * description. The fourth ("plain") is the normal attack with a blood flavour, treated like a Genesis element: its
 * icon is the blood with the weapon's small in the corner, and its name is a template in which {nome} is the attack's.
 * The description texts may hold inline rolls, which the chat makes clickable.
 */
export const GIGANTO_DEFAULTS = [
  {
    id: "clots", label: "Grumi", color: "#a3202a",
    name: "Grumi di Sangue",
    icon: "icons/magic/unholy/projectiles-blood-salvo-red.webp",
    description: "<p>Alsa crea due grumi di sangue, lanciabili individualmente in un'area adiacente. Ognuno colpisce un nemico casuale dell'area, infliggendo metà del danno dell'arma equipaggiata (per difetto) + 3.</p>"
  },
  {
    id: "ray", label: "Raggio", color: "#a3202a",
    name: "Raggio di Sangue",
    icon: "icons/magic/unholy/strike-beam-blood-large-red-purple.webp",
    description: "<p>Un raggio di sangue fuoriesce dalla bocca di Zoe e colpisce un'area adiacente. Scegli un bersaglio principale, che subisce il danno dell'arma; gli altri subiscono [[/r 1d6+3]] danni. L'area diventa grumosa, rendendola terreno svantaggioso.</p>"
  },
  {
    id: "spikes", label: "Spuntoni", color: "#a3202a",
    name: "Spuntoni di Sangue",
    icon: "icons/magic/earth/strike-stone-stalactite-blood-red.webp",
    description: "<p>Dal corpo di Zoe fuoriescono svariati spuntoni di sangue che infilzano gli avversari nell'area dove si trova Zoe (massimo 3 bersagli a scelta). Subiscono metà del danno dell'arma (per difetto) e fanno un tiro di Agilità: se falliscono, subiscono altri [[/r 1d6]] danni extra e lo status Impaired.</p>"
  },
  {
    id: "blood", label: "Sangue", color: "#a3202a", plain: true,
    name: "{nome} di Sangue",
    icon: "icons/skills/wounds/blood-spurt-spray-red.webp",
    description: "<p>Il colpo è intriso del sangue di Zoe.</p>"
  }
];

/** The Gigantomachia options with the table's changes on top of the defaults. */
export function gigantomachiaOptions() {
  const saved = savedEntries("gigantomachia");
  return GIGANTO_DEFAULTS.map(base => ({ ...base, ...(saved[base.id] ?? {}) }));
}

/**
 * The ways the PG's unarmed weapon can be described in the attack dialog. They are flavour only: they change the
 * card's name, icon and description, never the damage or anything else of the weapon. An empty icon or description
 * keeps the weapon's own.
 */
export const STYLE_DEFAULTS = [
  {
    id: "punch", label: "Pugno", name: "Pugno",
    icon: "systems/demonlord/assets/icons/weapons/fist.webp",
    description: "<p>Alsa sferra un pugno.</p>"
  },
  {
    id: "kick", label: "Calcio", name: "Calcio",
    icon: "icons/equipment/feet/boots-armored-leather-brown.webp",
    description: "<p>Alsa sferra un calcio.</p>"
  },
  {
    id: "headbutt", label: "Testata", name: "Testata",
    icon: "icons/skills/wounds/injury-face-impact-orange.webp",
    description: "<p>Alsa colpisce con una testata.</p>"
  },
  {
    id: "elbow", label: "Gomitata", name: "Gomitata",
    icon: "icons/skills/wounds/anatomy-bone-joint.webp",
    description: "<p>Alsa colpisce con una gomitata.</p>"
  },
  {
    id: "knee", label: "Ginocchiata", name: "Ginocchiata",
    icon: "icons/skills/wounds/bone-broken-knee-beam.webp",
    description: "<p>Alsa colpisce con una ginocchiata.</p>"
  },
  {
    id: "claws", label: "Artigli", name: "Artigli",
    icon: "icons/creatures/claws/claw-talons-glowing-orange.webp",
    description: "<p>Alsa colpisce con gli artigli.</p>"
  },
  {
    id: "bite", label: "Morso", name: "Morso",
    icon: "icons/creatures/abilities/fangs-teeth-bite.webp",
    description: "<p>Alsa morde l'avversario.</p>"
  }
];

/**
 * The style row has one profile per form of the PG. The order is the order of the tiles, and the first one is
 * what is selected until another is used.
 * - human: on the unarmed weapon, with no other form on.
 * - cat: on the cat claws, while the cat form is on. There the claws keep the weapon's own name and icon (as they
 *   are now) and the bite comes right after them.
 * - hybrid: the same, on the hybrid claws, while the hybrid form is on (the PG gets it at level 4).
 */
const PROFILE_ORDER = {
  human: ["punch", "kick", "headbutt", "elbow", "knee", "claws", "bite"],
  cat: ["claws", "bite", "punch", "kick", "headbutt", "elbow", "knee"],
  hybrid: ["claws", "bite", "punch", "kick", "headbutt", "elbow", "knee"]
};
// What a style leaves to the weapon in a profile: in cat form the claws keep the weapon's own name and icon (the
// description is the style's, like the other styles').
const PROFILE_PLAIN = { cat: { claws: { name: "", icon: "" } }, hybrid: { claws: { name: "", icon: "" } } };

/** The styles of a profile, in its order, with the table's changes on top of the defaults. */
export function attackStyles(profile = "human") {
  const saved = savedEntries("styles");
  return PROFILE_ORDER[profile ?? "human"].map(id => {
    const base = STYLE_DEFAULTS.find(entry => entry.id === id);
    return { ...base, ...(saved[id] ?? {}), ...(PROFILE_PLAIN[profile]?.[id] ?? {}) };
  });
}

const splitNames = text => String(text ?? "").split(",").map(name => name.trim().toLowerCase()).filter(Boolean);
const sameName = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const effectOn = (actor, names) => [...actor.appliedEffects].some(effect =>
  !effect.disabled && !effect.isSuppressed && names.some(name => effect.name?.toLowerCase().startsWith(name)));

/**
 * Which style profile an attack gets, if any: only the Genesis actor's, and only on its unarmed weapon in human form
 * (while no effect of another form is on), on its cat claws in cat form or on its hybrid claws in hybrid form (while
 * the effect of that form is on).
 */
export function styleProfile(actor, item) {
  if (!actor || !item || actor.id !== genesisActor()?.id || item.type !== "weapon") return null;
  const humanWeapon = alsaSetting("styleWeapon") || "Pugno";
  const catWeapon = alsaSetting("styleCatWeapon") || "Artigli (Gatto)";
  if (sameName(item.name, humanWeapon)) {
    return effectOn(actor, splitNames(alsaSetting("styleBlock"))) ? null : "human";
  }
  if (sameName(item.name, catWeapon)) {
    return effectOn(actor, splitNames(alsaSetting("styleCatEffect") || "Forma Gatto")) ? "cat" : null;
  }
  const hybridWeapon = alsaSetting("styleHybridWeapon") || "Artigli (Ibrido)";
  if (sameName(item.name, hybridWeapon)) {
    return effectOn(actor, splitNames(alsaSetting("styleHybridEffect") || "Forma Ibrida")) ? "hybrid" : null;
  }
  return null;
}

/**
 * What the table changed, kept in a flag on the Genesis actor itself so that whoever controls that PG can edit it
 * (the world settings are the GM's alone). Only the choice of the actor stays a world setting. Values saved in the
 * world settings by an earlier version are still read until the config is saved again.
 */
const LEGACY_SETTINGS = {
  effectName: ["genesisEffectName", "Genesis"],
  iconMode: ["genesisIconMode", "badge"],
  styleWeapon: ["attackStyleWeapon", "Pugno"],
  styleBlock: ["attackStyleBlockEffects", "Forma Gatto, Forma Ibrida"],
  styleCatWeapon: ["attackStyleCatWeapon", "Artigli (Gatto)"],
  styleCatEffect: ["attackStyleCatEffect", "Forma Gatto"],
  // Added later: no older world setting to fall back on.
  styleHybridWeapon: [null, "Artigli (Ibrido)"],
  styleHybridEffect: [null, "Forma Ibrida"],
  gigantoEffect: [null, "Gigantomachia"]
};

export function alsaConfig() {
  return genesisActor()?.getFlag(MODULE_ID, "alsa") ?? {};
}

/** One of the plain settings (effect name, icon mode, weapons, blocking effects): the flag's, else the older world setting. */
export function alsaSetting(key) {
  const value = alsaConfig()[key];
  if (value !== undefined) return value;
  const [name, fallback] = LEGACY_SETTINGS[key];
  return (name && game.settings.get(MODULE_ID, name)) || fallback;
}

/** The saved changes to the elements (or the styles): the flag's, else the older world setting's. */
function savedEntries(kind) {
  return alsaConfig()[kind] ?? game.settings.get(MODULE_ID, "genesisConfig")?.[kind] ?? {};
}

/** The elements with the table's changes on top of the defaults. */
export function genesisElements() {
  const saved = savedEntries("elements");
  return GENESIS_DEFAULTS.map(base => ({ ...base, ...(saved[base.id] ?? {}) }));
}

/** The one actor Genesis is for: the one picked in the config window, else the first actor with "Alsa" in its name. */
export function genesisActor() {
  const id = game.settings.get(MODULE_ID, "genesisActorId");
  return (id && game.actors.get(id)) || game.actors.find(actor => /alsa/i.test(actor.name)) || null;
}

/** Whether an effect whose name starts with the text is enabled on the actor (and the actor is the Genesis actor). */
function modeActive(actor, prefix) {
  if (!actor || actor.id !== genesisActor()?.id) return false;
  const start = String(prefix).trim().toLowerCase();
  return [...actor.appliedEffects].some(effect => !effect.disabled && !effect.isSuppressed && effect.name?.toLowerCase().startsWith(start));
}

/** Genesis is on while its effect (any effect whose name starts with the configured text) is enabled on the actor. */
export function genesisActive(actor) {
  return modeActive(actor, alsaSetting("effectName") || "Genesis");
}

/** Gigantomachia is on while its effect is enabled on the actor, the same way. */
export function gigantomachiaActive(actor) {
  return modeActive(actor, alsaSetting("gigantoEffect") || "Gigantomachia");
}

/** The attack's name for an element: its template with {nome} replaced, or the attack's own name if the template is empty. */
export function elementAttackName(element, item) {
  const template = String(element.name ?? "").trim();
  return template ? template.replace(/\{nome\}/gi, item.name) : item.name;
}

/** The ways the attack's icon can change; the config window lists them in this order. */
export const ICON_MODES = [
  { id: "badge", label: "Icona dell'elemento, con l'arma piccola nell'angolo" },
  { id: "blend", label: "Icona dell'arma fusa con quella dell'elemento" },
  { id: "replace", label: "Solo l'icona dell'elemento" }
];

export function genesisIconMode() {
  const mode = alsaSetting("iconMode");
  if (mode === "fuse") return "blend"; // the name this mode had in the first version
  return ICON_MODES.some(candidate => candidate.id === mode) ? mode : "badge";
}

/* The composed icons are drawn once per pair and kept as small data images (the chat card then carries them, so
   they need no file of their own).
   - badge: the element's icon fills the picture and the weapon's sits small in the bottom right corner.
   - blend: the element's icon is the background and the weapon's sits over it in "hard light", with a light second
     pass on top that lifts the dark elements (ice, water). */
const COMPOSED_SIZE = 96;
const composed = new Map();

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(src));
    image.src = src;
  });
}

/** A small picture in a framed rounded square, with a shadow, drawn at (x, y). */
function paintBadge(context, image, x, y, badge) {
  const corner = Math.round(badge * 0.17);
  context.save();
  context.beginPath();
  context.roundRect(x, y, badge, badge, corner);
  context.shadowColor = "rgba(0, 0, 0, 0.8)";
  context.shadowBlur = 6;
  context.fillStyle = "#1b1612";
  context.fill();
  context.restore();
  context.save();
  context.beginPath();
  context.roundRect(x, y, badge, badge, corner);
  context.clip();
  context.drawImage(image, x, y, badge, badge);
  context.restore();
  context.beginPath();
  context.roundRect(x, y, badge, badge, corner);
  context.lineWidth = 2.5;
  context.strokeStyle = "#f4ead2";
  context.stroke();
}

function drawBadge(context, weapon, element) {
  const size = COMPOSED_SIZE;
  context.drawImage(element, 0, 0, size, size);
  const badge = Math.round(size * 0.46);
  paintBadge(context, weapon, size - badge - 3, size - badge - 3, badge);
}

function drawBlend(context, weapon, element) {
  const size = COMPOSED_SIZE;
  context.drawImage(element, 0, 0, size, size);
  context.globalCompositeOperation = "hard-light";
  context.globalAlpha = 0.9;
  context.drawImage(weapon, 0, 0, size, size);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 0.35;
  context.drawImage(weapon, 0, 0, size, size);
}

/**
 * A big icon with up to two small ones in its bottom corners: the first small one (the weapon's) bottom right, the
 * second (the element's) bottom left. It is what an attack gets when two flavours meet, a Gigantomachia option and a
 * Genesis element: the option is the big icon and the weapon and the element are small. With the icon mode "replace"
 * only the big icon is kept.
 */
export function composeBadges(bigSrc, smallSrcs, mode = genesisIconMode()) {
  const smalls = smallSrcs.filter(Boolean);
  if (mode === "replace" || !smalls.length) return Promise.resolve(bigSrc);
  const key = `badges|${bigSrc}|${smalls.join("|")}`;
  if (!composed.has(key)) {
    composed.set(key, (async () => {
      const [big, ...small] = await Promise.all([bigSrc, ...smalls].map(loadImage));
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = COMPOSED_SIZE;
      const context = canvas.getContext("2d");
      context.drawImage(big, 0, 0, COMPOSED_SIZE, COMPOSED_SIZE);
      const badge = Math.round(COMPOSED_SIZE * (small.length > 1 ? 0.4 : 0.46));
      const y = COMPOSED_SIZE - badge - 3;
      small.slice(0, 2).forEach((image, index) => paintBadge(context, image, index === 0 ? COMPOSED_SIZE - badge - 3 : 3, y, badge));
      return canvas.toDataURL("image/webp", 0.9);
    })().catch(() => bigSrc));
  }
  return composed.get(key);
}

/** The weapon's and the element's icons composed in the given mode; the element's own icon if either picture cannot be read. */
export function composeIcon(weaponSrc, elementSrc, mode = genesisIconMode()) {
  if (mode === "replace") return Promise.resolve(elementSrc);
  const key = `${mode}|${weaponSrc}|${elementSrc}`;
  if (!composed.has(key)) {
    composed.set(key, (async () => {
      const [weapon, element] = await Promise.all([loadImage(weaponSrc), loadImage(elementSrc)]);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = COMPOSED_SIZE;
      (mode === "blend" ? drawBlend : drawBadge)(canvas.getContext("2d"), weapon, element);
      return canvas.toDataURL("image/webp", 0.9);
    })().catch(() => elementSrc));
  }
  return composed.get(key);
}

/**
 * The icon of the damage line of the attack card, by damage type. The system draws one generic icon (a sword with the
 * marks of the blow, in black) on every damage line; a type listed here gets its own. "cutout" icons are white shapes
 * on black: the black is made transparent and the shape is drawn in black, so it is the shape alone, black like the
 * sword. "derived" and "drawn" ones are made by a function (a derived one may return nothing, and the generic icon then stays).
 */
const DAMAGE_TYPE_ICONS = [
  { match: /contundent/i, icon: "systems/demonlord/assets/icons/olditems/punch.webp", cutout: true },
  { match: /perforant/i, icon: "systems/demonlord/assets/icons/olditems/fangs.webp", cutout: true },
  // Veleno, Veleno Concentrato: a drop.
  { match: /velen/i, drawn: drawDrop },
  // Taglio, Tagliente, Tagliante: the marks of the blow from the system's own icon, without its sword.
  { match: /tagli/i, derived: slashCuts }
];

const CUTOUT_SIZE = 64;
let dropIcon = null;

/** A drop, black on transparency, with a small clear highlight on its left; drawn once and kept. */
function drawDrop() {
  if (!dropIcon) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = CUTOUT_SIZE;
    const context = canvas.getContext("2d");
    context.fillStyle = "#000";
    context.beginPath();
    context.moveTo(32, 3);
    context.bezierCurveTo(44, 17, 54, 30, 54, 41);
    context.arc(32, 41, 22, 0, Math.PI, false);
    context.bezierCurveTo(10, 30, 20, 17, 32, 3);
    context.closePath();
    context.fill();
    // The highlight is cut out of the drop, so it shows whatever is behind the icon.
    context.globalCompositeOperation = "destination-out";
    context.lineWidth = 4.5;
    context.lineCap = "round";
    context.beginPath();
    context.arc(32, 41, 15, Math.PI * 0.62, Math.PI * 0.95, false);
    context.stroke();
    dropIcon = canvas.toDataURL("image/png");
  }
  return dropIcon;
}
const SYSTEM_DAMAGE_ICON = "systems/demonlord/assets/ui/items/damage.webp";
let slashCutsIcon = null;

/**
 * The system's generic damage icon is a sword with two jagged marks of the blow, apart from it. This keeps the marks
 * and drops the sword: the picture is split into its separate black shapes, and the ones lying on the sword's diagonal
 * (the sword and its parts) are left out. The two marks are then moved toward each other, until they merge into one shape,
 * and the result is cropped and scaled to fill the icon.
 */
function slashCuts() {
  slashCutsIcon ??= (async () => {
    const size = 512;
    const image = await loadImage(SYSTEM_DAMAGE_ICON);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, size, size);
    const alpha = context.getImageData(0, 0, size, size).data;
    const total = size * size;

    // Label the connected shapes (4 neighbours) of everything that is not transparent.
    const labels = new Int32Array(total);
    const stack = new Int32Array(total);
    const shapes = [];
    for (let start = 0; start < total; start++) {
      if (labels[start] || alpha[start * 4 + 3] < 20) continue;
      const label = shapes.length + 1;
      let top = 0;
      stack[top++] = start;
      labels[start] = label;
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      while (top) {
        const p = stack[--top];
        const x = p % size;
        const y = (p / size) | 0;
        count++;
        sumX += x;
        sumY += y;
        for (const q of [x > 0 ? p - 1 : -1, x < size - 1 ? p + 1 : -1, y > 0 ? p - size : -1, y < size - 1 ? p + size : -1]) {
          if (q >= 0 && !labels[q] && alpha[q * 4 + 3] >= 20) {
            labels[q] = label;
            stack[top++] = q;
          }
        }
      }
      shapes.push({ label, count, x: sumX / count, y: sumY / count });
    }

    // The sword runs along the anti-diagonal (x + y = size): the marks are the big shapes away from it.
    const marks = shapes.filter(shape => shape.count > 400 && Math.abs(shape.x + shape.y - size) / Math.SQRT2 > size * 0.15);
    const drawn = document.createElement("canvas");
    drawn.width = drawn.height = size;
    const drawnContext = drawn.getContext("2d");
    for (const mark of marks) {
      const piece = document.createElement("canvas");
      piece.width = piece.height = size;
      const pieceContext = piece.getContext("2d");
      const pixels = pieceContext.createImageData(size, size);
      for (let p = 0; p < total; p++) if (labels[p] === mark.label) pixels.data[p * 4 + 3] = alpha[p * 4 + 3];
      pieceContext.putImageData(pixels, 0, 0);
      const shift = (-Math.sign(mark.x + mark.y - size) * 100) / Math.SQRT2; // toward the sword's diagonal
      drawnContext.drawImage(piece, shift, shift);
    }

    // Crop to what was drawn and fit it in the icon, centred.
    const out = drawnContext.getImageData(0, 0, size, size).data;
    let left = size, top = size, right = 0, bottom = 0;
    for (let p = 0; p < total; p++) {
      if (out[p * 4 + 3] <= 20) continue;
      const x = p % size;
      const y = (p / size) | 0;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    const width = right - left + 1;
    const height = bottom - top + 1;
    const scale = (CUTOUT_SIZE - 4) / Math.max(width, height);
    const final = document.createElement("canvas");
    final.width = final.height = CUTOUT_SIZE;
    final.getContext("2d").drawImage(drawn, left, top, width, height,
      (CUTOUT_SIZE - width * scale) / 2, (CUTOUT_SIZE - height * scale) / 2, width * scale, height * scale);
    return final.toDataURL("image/png");
  })().catch(() => null);
  return slashCutsIcon;
}
const cutouts = new Map();

/** A white-on-black picture as a black shape on transparency (the brightness becomes the opacity). */
function cutout(src) {
  if (!cutouts.has(src)) {
    cutouts.set(src, (async () => {
      const image = await loadImage(src);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = CUTOUT_SIZE;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, CUTOUT_SIZE, CUTOUT_SIZE);
      const pixels = context.getImageData(0, 0, CUTOUT_SIZE, CUTOUT_SIZE);
      const data = pixels.data;
      for (let i = 0; i < data.length; i += 4) {
        const brightness = Math.max(data[i], data[i + 1], data[i + 2]);
        data[i] = data[i + 1] = data[i + 2] = 0;
        data[i + 3] = Math.min(255, brightness * (data[i + 3] / 255));
      }
      context.putImageData(pixels, 0, 0);
      return canvas.toDataURL("image/png");
    })().catch(() => src));
  }
  return cutouts.get(src);
}

/** The drop used for blood damage lines (the same one as poison). */
export function bloodDropIcon() {
  return drawDrop();
}

/** The damage line icon for a damage type, or null if the system's generic one should stay. */
export async function damageTypeIcon(type) {
  const entry = DAMAGE_TYPE_ICONS.find(candidate => candidate.match.test(String(type ?? "")));
  if (!entry) return null;
  if (entry.drawn) return entry.drawn();
  if (entry.derived) return entry.derived();
  return entry.cutout ? cutout(entry.icon) : entry.icon;
}
