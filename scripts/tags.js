import { persistenceActor, displayedEffects } from "./persistence.js";

const FLAG_NAMESPACE = "clustersomnia";

// Quick-glance "tags" (Atk, Def, Agi...) for the compact party cards. Two sources:
//  - automatic, from the character's active effects. By default *every* active effect counts, permanent ones
//    included. The setting "tagsEveryEffect" can narrow it to the effects that are *not permanent*: the temporary ones (spells,
//    effects placed by hand on the sheet, afflictions, anything with a duration) and the ones picked in the
//    Tracker's "Search Effects" (a removable talent like Sand Orb, a switchable form, a situational ability).
//    Nothing in the data tells a class talent from a removable one, so that choice is the player's; whatever is
//    not picked (path levels, class talents, features, ancestry, equipment) is ignored;
//  - manual, set from the Tracker for what has no effect to read (a spell described only in words, an ally's buff).
// The tag does not look at numbers: every separate buff or debuff entry on a category is one step, and the steps
// pile up. ARROWS_PER_TIER arrows fill a tier, then the tag moves to the next colour and starts over. After
// MAX_TIER + 1 full tiers the next step (the 10th, up or down) is the special one: no arrows, an emblem instead.

export const ARROWS_PER_TIER = 3;
export const MAX_TIER = 2;
export const MAX_STEPS = ARROWS_PER_TIER * (MAX_TIER + 1) + 1;

// One tag per category and direction, whatever the number of effects behind it. First match wins, and the
// order of this list is the order tags are shown in.
export const TAG_CATEGORIES = [
  // Attack bonuses split in two: spells go to Mag, everything else to Atk / Hit / Crit. "damage" with nothing after it
  // is a plain bonus to the damage of any attack (many talents use it), so it counts for Atk like "damage.all" does.
  { id: "atk", label: "Atk", name: "Attacco", keys: /^system\.bonuses\.attack\.(damage($|\.(?!spell))|extraEffect)/ },
  { id: "mag", label: "Mag", name: "Magia", keys: /^system\.bonuses\.attack\.(damage|boons)\.spell/ },
  { id: "hit", label: "Hit", name: "Colpire", keys: /^system\.bonuses\.attack\.boons\.(?!spell)/ },
  // A boon to attacks improves both the hit and the critical, so those keys feed Hit and Crit together.
  { id: "crit", label: "Crit", name: "Critico", keys: /^system\.bonuses\.attack\.(plus20Damage|boons\.(?!spell))/ },
  { id: "def", label: "Def", name: "Difesa", keys: /^system\.bonuses\.(armor|defense)\.|^system\.characteristics\.defense/ },
  // The challenge boons "all" count for each of the five attributes: one such effect adds a step to Str, Agi, Int, Wil and Per.
  { id: "str", label: "Str", name: "Forza", keys: /attributes\.strength|challenge\.boons\.(strength|all)/ },
  { id: "agi", label: "Agi", name: "Agilità", keys: /attributes\.agility|challenge\.boons\.(agility|all)/ },
  { id: "int", label: "Int", name: "Intelletto", keys: /attributes\.intellect|challenge\.boons\.(intellect|all)/ },
  { id: "wil", label: "Wil", name: "Volontà", keys: /attributes\.will|challenge\.boons\.(will|all)/ },
  { id: "per", label: "Per", name: "Percezione", keys: /attributes\.perception|challenge\.boons\.(perception|all)/ },
  { id: "spd", label: "Spd", name: "Velocità", keys: /^system\.characteristics\.speed/ },
  { id: "hp", label: "PV", name: "Punti ferita", keys: /^system\.characteristics\.health\.max/ },
  { id: "pow", label: "Pow", name: "Potere", keys: /^system\.characteristics\.power/ },
  { id: "size", label: "Size", name: "Taglia", keys: /^system\.characteristics\.size/ }
];

// `flags.sourceType` is what the system itself stamps on every effect; "permanent" is not reliable on its own
// (Soft Leather says false), so the temporary kinds are listed instead of the permanent ones.
const TEMPORARY_SOURCES = new Set(["spell", "character", "affliction"]);

function isTemporary(effect) {
  if (effect.flags?.permanent) return false;
  if (effect.duration?.type && effect.duration.type !== "none") return true;
  return TEMPORARY_SOURCES.has(effect.flags?.sourceType);
}

function isActive(effect) {
  return !effect.disabled && !effect.isSuppressed;
}

/** A number, or a fraction like "1/4" (sizes are written that way). */
function numberOf(value) {
  const [top, bottom] = String(value ?? "").trim().split("/");
  const result = bottom === undefined ? parseFloat(top) : parseFloat(top) / parseFloat(bottom);
  return Number.isFinite(result) ? result : NaN;
}

/**
 * A leading minus is a penalty; anything else (a number, a die, an override) counts as a bonus. The exception is the
 * size, where the sign says nothing (Forma Gatto *multiplies* it by 1/4): the effect is applied to the base size
 * in its own mode and the tag is up or down by how the result compares to the base.
 */
function directionOf(change, actor) {
  if (/characteristics\.size$/.test(change.key)) {
    const modes = CONST.ACTIVE_EFFECT_MODES;
    const value = numberOf(change.value);
    const base = numberOf(actor._source?.system?.characteristics?.size);
    if (Number.isFinite(value) && Number.isFinite(base)) {
      const result = {
        [modes.MULTIPLY]: base * value,
        [modes.ADD]: base + value,
        [modes.OVERRIDE]: value,
        [modes.UPGRADE]: Math.max(base, value),
        [modes.DOWNGRADE]: Math.min(base, value)
      }[change.mode];
      if (result !== undefined) return result < base ? "down" : result > base ? "up" : null;
    }
  }
  return String(change.value ?? "").trim().startsWith("-") ? "down" : "up";
}

// A PG's specialization is named after its highest attribute (Perception does not take part). These four are the
// "base" ones; `id` is the attribute, which is what the actor flag stores.
export const SPECIALIZATIONS = [
  { id: "strength", attribute: "strength", name: "Vigoroso", short: "Vig", stat: "Forza", icon: "fa-solid fa-dumbbell", color: 0xe0603c },
  { id: "agility", attribute: "agility", name: "Rapido", short: "Rap", stat: "Agilità", icon: "fa-solid fa-leaf", color: 0x5ec86a },
  { id: "intellect", attribute: "intellect", name: "Arcano", short: "Arc", stat: "Intelligenza", icon: "fa-solid fa-hat-wizard", color: 0x8a6cf0 },
  { id: "will", attribute: "will", name: "Spirituale", short: "Spi", stat: "Volontà", icon: "fa-solid fa-hands-praying", color: 0xf0d060 }
];

/**
 * The common specializations of the rulebook (regole/clustersomnia-regolamento.md, section 8): where the library
 * starts. The GM adds, edits and removes entries from the actor panel; the list is the world setting
 * `specializationLibrary`, so it is shared by every actor. `color` is a CSS hex string, `icon` a FontAwesome class.
 */
export const DEFAULT_LIBRARY = [
  { id: "volante", name: "Volante", short: "Vol", icon: "fa-solid fa-dove", color: "#7fc8f8", effect: "Impone svantaggio ai colpi contro di lui, tranne a chi è Volante o ha Portata." },
  { id: "nuotatore", name: "Nuotatore", short: "Nuo", icon: "fa-solid fa-fish", color: "#3aa0d8", effect: "Non ha impedimenti nelle zone d'acqua, e lì ha vantaggio ai tiri per colpire." },
  { id: "scalatore", name: "Scalatore", short: "Sca", icon: "fa-solid fa-mountain", color: "#a8855a", effect: "Non ha impedimenti sui terreni difficili né nell'arrampicarsi." },
  { id: "pesante", name: "Pesante", short: "Pes", icon: "fa-solid fa-weight-hanging", color: "#9a9a9a", effect: "Subisce metà dei danni, tranne quando è prono." },
  { id: "elusivo", name: "Elusivo", short: "Elu", icon: "fa-solid fa-user-ninja", color: "#b070d8", effect: "Impone svantaggio ai colpi contro di lui, tranne a chi è Veloce o ha Portata." },
  { id: "corazzato", name: "Corazzato", short: "Cor", icon: "fa-solid fa-shield-halved", color: "#c0c8d0", effect: "Subisce metà dei danni, tranne dalle magie." },
  { id: "magimmunita", name: "Magimmunità", short: "Mim", icon: "fa-solid fa-ban", color: "#e060c0", effect: "Subisce metà dei danni, tranne dagli attacchi fisici." },
  { id: "resiliente", name: "Resiliente", short: "Res", icon: "fa-solid fa-heart", color: "#e05060", effect: "Subisce metà dei danni, tranne dalle Abilità Unione." },
  { id: "veloce", name: "Veloce", short: "Vel", icon: "fa-solid fa-bolt", color: "#f0e040", effect: "Chi ha Velocità 14 o più è Veloce. Con un movimento può spostarsi di due zone invece di una, ma non due volte di seguito." },
  { id: "portata", name: "Portata", short: "Por", icon: "fa-solid fa-crosshairs", color: "#f09040", effect: "Ottiene un bonus di Precisione che dipende dalla portata dell'arma o dei suoi attacchi. In certe condizioni può colpire le zone adiacenti." }
];

export const SPECIALIZATION_LIBRARY_SETTING = "specializationLibrary";

const cssToNumber = color => {
  const value = parseInt(String(color ?? "").replace("#", ""), 16);
  return Number.isFinite(value) ? value : 0xcccccc;
};
export const numberToCss = color => `#${Number(color).toString(16).padStart(6, "0")}`;

/** The library as saved in the world (the defaults until the setting exists), with the colour as a number. */
export function libraryOf() {
  let saved;
  try { saved = game.settings.get(FLAG_NAMESPACE, SPECIALIZATION_LIBRARY_SETTING); } catch (_error) { saved = null; }
  const list = Array.isArray(saved) ? saved : DEFAULT_LIBRARY;
  return list.filter(entry => entry?.id && entry.name).map(entry => ({ ...entry, color: cssToNumber(entry.color) }));
}

/** The four base specializations followed by the library: everything an actor can be given. */
export function allSpecializations() {
  return [...SPECIALIZATIONS, ...libraryOf()];
}

/** The FontAwesome code point of an icon class, read from the stylesheet (the token badge draws it as text). */
const glyphs = new Map();
export function glyphOf(icon) {
  if (glyphs.has(icon)) return glyphs.get(icon);
  const element = document.createElement("i");
  element.className = /\bfa-(solid|regular|light|thin|brands)\b/.test(icon) ? icon : `fa-solid ${icon}`;
  element.style.cssText = "position:absolute;visibility:hidden";
  document.body.append(element);
  const content = getComputedStyle(element, "::before").content;
  element.remove();
  const glyph = content && content !== "none" && content !== "normal" ? content.replace(/^["']|["']$/g, "") : "";
  if (glyph) glyphs.set(icon, glyph);
  return glyph;
}

/** The flag with the specializations chosen by hand: an array of ids (`["strength", "volante"]`). */
export const SPECIALIZATIONS_FLAG = "specializations";

/**
 * Every specialization of an actor. When the flag is set it is the whole answer, even if empty (a monster with none).
 * Without it, `auto` falls back to the single highest-attribute rule of `specializationOf`, which is what the party
 * cards want for a PG; the tokens pass `auto: false` so a monster only shows what was assigned. An id that is no
 * longer in the library is skipped.
 */
export function specializationsOf(actor, { auto = true } = {}) {
  const chosen = persistenceActor(actor).getFlag(FLAG_NAMESPACE, SPECIALIZATIONS_FLAG);
  if (Array.isArray(chosen)) return allSpecializations().filter(entry => chosen.includes(entry.id));
  if (!auto) return [];
  const automatic = specializationOf(actor);
  return automatic ? [automatic] : [];
}

/** What a tag button or a "from effects" item shows: arrows by direction and the colour tier of its steps. */
export function tagDisplay(signed) {
  if (!signed) return { steps: 0, up: false, down: false, tier: 0, glyphs: "" };
  const { tier, arrows, special } = levelOf(Math.abs(signed));
  const up = signed > 0;
  // The special last step has no arrows: a star for a buff, a cross for a debuff.
  const glyphs = special ? (up ? "★" : "✖") : (up ? "▲" : "▼").repeat(arrows);
  return { steps: Math.abs(signed), up, down: !up, tier, glyphs };
}

/** Adds `delta` steps to a manual tag (buff positive, debuff negative), kept on the world actor. */
export function stepManualTag(actor, id, delta) {
  const current = manualTags(actor)[id] ?? 0;
  const next = Math.max(-MAX_STEPS, Math.min(MAX_STEPS, current + delta));
  if (next === current) return;
  // "-=" is how a key is deleted from an object flag; setFlag would only merge.
  const path = `flags.${FLAG_NAMESPACE}.tags.${next ? id : `-=${id}`}`;
  return persistenceActor(actor).update({ [path]: next || null });
}

/**
 * The specialization of an actor: the attribute with the highest current value, or `null`. A PG has only one, so
 * when several share the top the first in SPECIALIZATIONS wins (Strength, Agility, Intellect, Will). When all four
 * are equal there is no highest and the result is `null`.
 */
export function specializationOf(actor) {
  const values = SPECIALIZATIONS.map(entry => ({ ...entry, value: Number(actor.system.attributes?.[entry.attribute]?.value) }))
    .filter(entry => Number.isFinite(entry.value));
  if (!values.length) return null;
  const top = Math.max(...values.map(entry => entry.value));
  if (values.every(entry => entry.value === top)) return null;
  return values.find(entry => entry.value === top);
}

/**
 * The manual tags of an actor: `{ atk: 2, def: -1 }`, the number of buff (positive) or debuff (negative) steps.
 * Values saved by an earlier version as "up" / "up2" / "down" / "down2" are read as 1 / 2 / -1 / -2.
 */
export function manualTags(actor) {
  const raw = persistenceActor(actor).getFlag(FLAG_NAMESPACE, "tags") ?? {};
  const tags = {};
  for (const [id, value] of Object.entries(raw)) {
    const legacy = /^(up|down)(2?)$/.exec(value);
    const steps = legacy ? (legacy[1] === "up" ? 1 : -1) * (legacy[2] ? 2 : 1) : Number(value);
    if (Number.isFinite(steps) && steps !== 0) tags[id] = Math.max(-MAX_STEPS, Math.min(MAX_STEPS, Math.trunc(steps)));
  }
  return tags;
}

/** Where `steps` buff or debuff entries land: the colour tier, how many arrows, and whether it is the special last step. */
export function levelOf(steps) {
  const capped = Math.min(Math.max(steps, 1), MAX_STEPS);
  if (capped === MAX_STEPS) return { tier: MAX_TIER + 1, arrows: 0, special: true };
  return { tier: Math.floor((capped - 1) / ARROWS_PER_TIER), arrows: ((capped - 1) % ARROWS_PER_TIER) + 1, special: false };
}

/** Tags worked out from the temporary active effects only: one step per effect entry, `sources` are their names. */
function automaticSteps(actor) {
  const found = new Map();
  // By default every active effect counts. With "tagsEveryEffect" off only the temporary ones and the ones picked
  // in the Tracker's "Search Effects" do (see the header comment).
  const everything = game.settings.get(FLAG_NAMESPACE, "tagsEveryEffect");
  const picked = new Set(displayedEffects(actor).map(effect => effect.uuid));
  for (const effect of actor.allApplicableEffects()) {
    if (!isActive(effect) || !(everything || isTemporary(effect) || picked.has(effect.uuid))) continue;
    // An effect is one entry for a category however many of its changes land there.
    const entries = new Set();
    for (const change of effect.changes) {
      const dir = directionOf(change, actor);
      if (!dir) continue;
      for (const category of TAG_CATEGORIES.filter(candidate => candidate.keys.test(change.key))) {
        entries.add(`${category.id}:${dir}`);
      }
    }
    for (const key of entries) {
      const sources = found.get(key) ?? [];
      sources.push(effect.name);
      found.set(key, sources);
    }
  }
  return found;
}

/** The tags worked out from effects alone, for the Tracker's "from effects" line: `{ id, label, dir, steps, sources }`. */
export function automaticTags(actor) {
  return [...automaticSteps(actor)].map(([key, sources]) => {
    const [id, dir] = key.split(":");
    const category = TAG_CATEGORIES.find(candidate => candidate.id === id);
    return { id, label: category.label, name: category.name, dir, steps: sources.length, ...levelOf(sources.length), sources };
  });
}

/**
 * Every tag of an actor in display order: `{ id, label, name, dir, steps, tier, arrows, sources }`. Automatic and
 * manual steps of the same category and direction add up into one tag, and a buff cancels a debuff of the same
 * category one for one (equal numbers show nothing); `sources` are the names behind it, for the
 * tooltip ("Manuale" for hand-set ones).
 */
export function effectTags(actor) {
  const steps = automaticSteps(actor);
  for (const [id, signed] of Object.entries(manualTags(actor))) {
    const key = `${id}:${signed > 0 ? "up" : "down"}`;
    const sources = steps.get(key) ?? [];
    sources.push(...Array(Math.abs(signed)).fill("Manuale"));
    steps.set(key, sources);
  }
  // A buff and a debuff on the same category cancel one for one: only the surplus is shown, and nothing when equal.
  for (const category of TAG_CATEGORIES) {
    const up = steps.get(`${category.id}:up`);
    const down = steps.get(`${category.id}:down`);
    if (!up || !down) continue;
    const cancelled = Math.min(up.length, down.length);
    up.splice(0, cancelled);
    down.splice(0, cancelled);
    if (!up.length) steps.delete(`${category.id}:up`);
    if (!down.length) steps.delete(`${category.id}:down`);
  }
  const order = id => TAG_CATEGORIES.findIndex(category => category.id === id);
  return [...steps]
    .map(([key, sources]) => {
      const [id, dir] = key.split(":");
      const category = TAG_CATEGORIES.find(candidate => candidate.id === id);
      if (!category) return null;
      return { id, label: category.label, name: category.name, dir, steps: sources.length, ...levelOf(sources.length), sources };
    })
    .filter(Boolean)
    .sort((a, b) => order(a.id) - order(b.id) || (a.dir === "up" ? -1 : 1));
}
