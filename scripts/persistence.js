/**
 * The world actor to persist flags on. When the tracker is opened from an
 * unlinked token, `actor` is a synthetic token actor and flags set on it are
 * stored inside the scene's token data — gone when the token or scene goes.
 */
export function persistenceActor(actor) {
  return (actor.isToken ? actor.token?.baseActor : actor) ?? actor;
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
