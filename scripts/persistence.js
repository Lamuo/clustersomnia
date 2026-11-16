/**
 * The world actor to persist flags on. When the tracker is opened from an
 * unlinked token, `actor` is a synthetic token actor and flags set on it are
 * stored inside the scene's token data — gone when the token or scene goes.
 */
export function persistenceActor(actor) {
  return (actor.isToken ? actor.token?.baseActor : actor) ?? actor;
}

/**
 * The actor whose numbers are the real ones. A player character has one set of hit points and one shield, on its world
 * actor, whichever token or sheet shows or edits them: the sheet, the party cards, the Tracker and every token of that
 * PG must agree (an unlinked token has a copy of the actor that drifts apart the moment it is edited). Any other actor,
 * such as a monster, keeps the numbers of its own token, so each unlinked token is hurt on its own.
 */
export function realActor(actor) {
  return actor?.type === "character" ? persistenceActor(actor) : actor;
}

const FLAG_NAMESPACE = "clustersomnia";

/**
 * Click bursts. A +/- click shows its result at once (`paint`) and the write follows `delay` ms after the last click
 * of the burst, as one write of the final value: each write is a round trip to the server (and a redraw), so writing
 * per click is what made quick clicking feel laggy. Clicks add up on the pending value, not on the saved one, and
 * redraws should show `pendingBurst(key)` while it exists, so an older answer never flickers back.
 * `current` is the saved value (the base when nothing is pending); `compute(base)` returns the new one.
 */
const bursts = new Map();

export function pendingBurst(key) {
  return bursts.get(key)?.value;
}

export function burst(key, current, compute, { paint, write, done, delay = 200 }) {
  const pending = bursts.get(key);
  const base = pending ? pending.value : current;
  const value = compute(base);
  if (value === base) return;
  clearTimeout(pending?.timer);
  const entry = { value, timer: null };
  bursts.set(key, entry);
  paint?.(value);
  entry.timer = setTimeout(async () => {
    try {
      await write(entry.value);
    } finally {
      if (bursts.get(key) === entry) bursts.delete(key);
      done?.();
    }
  }, delay);
}

export const counterKey = (actor, counterId) => `counter|${persistenceActor(actor).id}|${counterId}`;

/** Steps a counter by `delta` (kept within 0..max) as a click burst; counters live on the world actor. */
export function stepCounter(actor, counterId, delta, { paint, done } = {}) {
  const world = persistenceActor(actor);
  const counter = (world.getFlag(FLAG_NAMESPACE, "counters") ?? []).find(c => c.id === counterId);
  if (!counter) return;
  burst(counterKey(actor, counterId), Number(counter.value) || 0,
    base => Math.min(counter.max ?? Infinity, Math.max(0, base + delta)), {
      paint,
      done,
      write: async value => {
        // Read the array when writing, so a rename or another counter changed meanwhile is not overwritten.
        const counters = foundry.utils.deepClone(world.getFlag(FLAG_NAMESPACE, "counters") ?? []);
        const target = counters.find(c => c.id === counterId);
        if (!target) return;
        target.value = value;
        await world.setFlag(FLAG_NAMESPACE, "counters", counters);
      }
    });
}

/**
 * Scene-independent identifier for an effect, relative to its owning actor.
 * Full UUIDs of token-actor effects embed the scene and token ids, so they
 * never match across tokens or scenes.
 */
export function effectKey(effect) {
  const parent = effect.parent;
  if (parent?.documentName === "Item") return `Item.${parent.id}.ActiveEffect.${effect.id}`;
  return `ActiveEffect.${effect.id}`;
}

/**
 * The effects the tracker is set to show for this actor (the ones ticked in "Search Effects").
 * Reads still accept raw uuids, which older saved data used.
 */
export function displayedEffects(actor) {
  const displayed = new Set(persistenceActor(actor).getFlag(FLAG_NAMESPACE, "displayedEffectIds") ?? []);
  return Array.from(actor.allApplicableEffects()).filter(effect => displayed.has(effectKey(effect)) || displayed.has(effect.uuid));
}

/**
 * The effects a token shows as little icons over it: the temporary ones, with a duration or a status (Injured,
 * Prone...). They come and go with the token's own icons, so the cards can follow them.
 * The cards hold the world actor, but an unlinked token keeps its statuses on its own synthetic actor: when the
 * scene has one for this actor, its effects are the ones the token shows.
 */
export function tokenEffects(actor) {
  let source = actor;
  if (!actor.isToken) {
    const token = canvas.tokens?.placeables.find(t => t.actor && !t.document.actorLink && t.document.actorId === actor.id);
    if (token) source = token.actor;
  }
  return [...(source.temporaryEffects ?? [])].filter(effect => !effect.disabled);
}

// The system gives a description to its afflictions (asleep, blinded...) but not to the plain statuses next to them
// (sleep, blind, fear...: 34 of 67 have none). Those that name the same condition borrow the affliction's text; the others
// may be described in the language file under CLUSTERSOMNIA.StatusDesc.<id>; without either the tooltip shows the name only.
const STATUS_ALIASES = {
  sleep: "asleep", stun: "stunned", prone: "prone", blind: "blinded", deaf: "deafened", fear: "frightened",
  disease: "diseased", poison: "poisoned", unconscious: "unconscious"
};

const plainText = html => {
  const holder = document.createElement("div");
  holder.innerHTML = html ?? "";
  return holder.textContent.trim();
};

// The system builds Injured, Incapacitated, Disabled and Dying with the description key DL.Afflictions<Name>, which its
// language files never define (the texts are under DL.<name>Text), so the effect keeps the bare key as its description.
// A description that is such a key is resolved here: the key itself if it exists, else DL.<status>Text.
const isKey = text => /^DL\.[A-Za-z0-9_.]+$/.test(text);
function resolveKey(text, statusIds) {
  if (!isKey(text)) return text;
  if (game.i18n.has(text)) return game.i18n.localize(text);
  const own = text.replace(/^DL\.Afflictions/, "");
  for (const id of [...statusIds, own.charAt(0).toLowerCase() + own.slice(1)]) {
    const key = `DL.${id}Text`;
    if (game.i18n.has(key)) return game.i18n.localize(key);
  }
  return "";
}

/** The text to show for an effect or status: its own description, else the one of the status it stands for. */
export function statusDescription(effect) {
  const ids = [...(effect.statuses ?? [])];
  const own = resolveKey(plainText(effect.description), ids);
  if (own) return own;
  const config = id => resolveKey(plainText(CONFIG.statusEffects.find(status => status.id === id)?.description), [id]);
  for (const id of effect.statuses ?? []) {
    const text = config(id) || config(STATUS_ALIASES[id]);
    if (text) return text;
    const key = `CLUSTERSOMNIA.StatusDesc.${id}`;
    if (game.i18n.has(key)) return game.i18n.localize(key);
  }
  return "";
}
