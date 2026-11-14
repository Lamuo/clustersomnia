import { persistenceActor } from "./persistence.js";
import { PRIMARY_ATTRIBUTE_FLAG, specializationOf, tiedTopAttributes } from "./tags.js";

const FLAG_NAMESPACE = "clustersomnia";

/**
 * On a PG's own sheet, when two or three attributes share the highest value, a small dot appears beside each of them.
 * The filled one is the PG's specialization (the one the party cards show); clicking another dot moves it there.
 * Without a tie there are no dots. The choice is the actor flag `clustersomnia.primaryAttribute`, read by
 * `specializationOf`; it only counts while that attribute is still among the tied ones.
 */
Hooks.on("renderActorSheet", (sheet, html) => {
  const actor = sheet.actor;
  if (!actor || actor.type !== "character" || !actor.isOwner) return;
  const root = html[0] ?? html;
  const tied = tiedTopAttributes(actor);
  if (!tied.length || tied.length === 4) return;
  const current = specializationOf(actor)?.attribute;

  for (const entry of tied) {
    const cell = root.querySelector(`input[name="system.attributes.${entry.attribute}.value"]`)?.closest(".attribute");
    if (!cell || cell.querySelector(".cs-primary-dot")) continue;
    const dot = document.createElement("span");
    dot.setAttribute("role", "button");
    dot.className = "cs-primary-dot";
    dot.classList.toggle("chosen", entry.attribute === current);
    dot.title = game.i18n.localize("CLUSTERSOMNIA.PrimaryAttributeHint");
    dot.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (entry.attribute !== current) persistenceActor(actor).setFlag(FLAG_NAMESPACE, PRIMARY_ATTRIBUTE_FLAG, entry.attribute);
    });
    cell.append(dot);
  }
});
