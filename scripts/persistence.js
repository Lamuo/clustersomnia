/**
 * The world actor to persist flags on. When the tracker is opened from an
 * unlinked token, `actor` is a synthetic token actor and flags set on it are
 * stored inside the scene's token data — gone when the token or scene goes.
 */
export function persistenceActor(actor) {
  return (actor.isToken ? actor.token?.baseActor : actor) ?? actor;
}

const FLAG_NAMESPACE = "clustersomnia";

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
