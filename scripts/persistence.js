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
