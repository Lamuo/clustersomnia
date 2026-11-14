import { persistenceActor } from "./persistence.js";

const FLAG_NAMESPACE = "clustersomnia";
const FLAG = "cardShow";

/**
 * Which party-card version shows each Tracker element of an actor: the simple card (compact, what the union meter
 * shows by default) and/or the advanced one (the card expanded by clicking the portrait, and the personal card).
 * Stored on the world actor as the object flag `clustersomnia.cardShow` { <key>: "s" | "a" | "sa" | "" }:
 *   - "tags"                the manual and automatic tags
 *   - "counter:<id>"        one counter
 *   - <effectKey>           one displayed effect
 * A missing entry means the default: tags on both, counters and effects on the advanced card only (how it was
 * before the choice existed). Dots in keys are replaced, because Foundry reads a dotted key as a path.
 */
const clean = key => String(key).replaceAll(".", "_");

const defaultMode = key => (key === "tags" ? "sa" : "a");

export function cardMode(actor, key) {
  const saved = persistenceActor(actor).getFlag(FLAG_NAMESPACE, FLAG);
  return saved?.[clean(key)] ?? defaultMode(key);
}

/** Does the card version (`advanced`: the expanded one) show this element? */
export function shownOnCard(actor, key, advanced) {
  return cardMode(actor, key).includes(advanced ? "a" : "s");
}

/** Flips the simple ("s") or advanced ("a") side of an element. */
export function toggleCardMode(actor, key, side) {
  const mode = cardMode(actor, key);
  const next = mode.includes(side) ? mode.replace(side, "") : [...new Set([...mode, side])].sort().reverse().join("");
  const saved = foundry.utils.deepClone(persistenceActor(actor).getFlag(FLAG_NAMESPACE, FLAG) ?? {});
  saved[clean(key)] = next;
  return persistenceActor(actor).setFlag(FLAG_NAMESPACE, FLAG, saved);
}
