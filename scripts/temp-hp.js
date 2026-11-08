// Temporary hit points / shield, for every actor. The system's data model has no field for it (and drops unknown
// keys), so the value lives in the actor flag clustersomnia.tempHp. It is shown on the actor sheet, on the party
// cards (union-meter.js), in the Tracker and on token bars (token-bar.js). The table edits the number; damage taken
// eats it first (the preUpdateActor hook below), whoever writes the damage.

import { realActor } from "./persistence.js";

const MODULE_ID = "clustersomnia";
const FLAG = "tempHp";

/** The actor that holds the temporary HP: the real one (see realActor), so every view of a PG shows the same shield. */
const shieldActor = realActor;

/** Current temporary HP of an actor (0 when none). */
export function tempHp(actor) {
  const value = Number(shieldActor(actor)?.getFlag(MODULE_ID, FLAG));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function setTempHp(actor, value) {
  const holder = shieldActor(actor);
  const next = Math.max(0, Math.floor(Number(value)) || 0);
  return next ? holder.setFlag(MODULE_ID, FLAG, next) : holder.unsetFlag(MODULE_ID, FLAG);
}

/* ------------------------------- Damage ------------------------------- */

// Damage that raises health.value (the damage taken) is taken off the temporary HP first, whoever writes it: the
// party cards, the Tracker, the sheet, the chat buttons. Healing lowers health.value and leaves the shield alone.
// An update that says options.csTempHandled has already dealt with the shield (or must leave it alone) and is skipped.
// The party cards only draw the shield at once; what they write is the click, and this hook does the taking off.
const HEALTH_PATH = "system.characteristics.health.value";

Hooks.on("preUpdateActor", (actor, changes, options) => {
  if (options.csTempHandled) return;
  const flat = HEALTH_PATH in changes;
  const next = flat ? changes[HEALTH_PATH] : foundry.utils.getProperty(changes, HEALTH_PATH);
  if (next === undefined) return;
  const temp = tempHp(actor);
  const raise = Number(next) - Number(actor.system.characteristics.health.value);
  if (!temp || !(raise > 0)) return;

  const absorbed = Math.min(temp, raise);
  if (flat) changes[HEALTH_PATH] = Number(next) - absorbed;
  else foundry.utils.setProperty(changes, HEALTH_PATH, Number(next) - absorbed);
  const left = temp - absorbed;
  // The shield of a PG lives on its world actor: when the damage lands on a token's own copy, the shield is written
  // there (a second update) and not in the token's data.
  if (shieldActor(actor) !== actor) {
    setTempHp(actor, left);
    return;
  }
  if (left) foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${FLAG}`, left);
  else foundry.utils.setProperty(changes, `flags.${MODULE_ID}.-=${FLAG}`, null);
});

/* ------------------------------ Actor sheet ------------------------------ */

function tempBox(actor) {
  const title = Handlebars.Utils.escapeExpression(game.i18n.localize("CLUSTERSOMNIA.TempHpFull"));
  const label = Handlebars.Utils.escapeExpression(game.i18n.localize("CLUSTERSOMNIA.TempHp"));
  const disabled = actor.isOwner ? "" : "disabled";
  return `<div class="speedbox cs-temphp" title="${title}">
    <div class="speedtext">${label}</div>
    <div class="speed"><input type="number" min="0" value="${tempHp(actor)}" ${disabled}></div>
  </div>`;
}

Hooks.on("renderActorSheet", (app, html) => {
  const root = html[0] ?? html;
  const actor = app.actor ?? app.document;
  if (!actor || root.querySelector(".cs-temphp")) return;

  // Character sheet: the empty cell beside Fabula. Creature sheet: a new row under the size / speed row.
  const fortune = root.querySelector(".spendFortune")?.closest(".chars");
  let placed = false;
  const empty = fortune && [...fortune.children].find(child => !child.children.length && !child.textContent.trim());
  if (empty) {
    empty.replaceWith(Object.assign(document.createElement("div"), { innerHTML: tempBox(actor) }).firstElementChild);
    placed = true;
  } else {
    const speedRow = root.querySelector('input[name="system.characteristics.speed"]')?.closest(".chars");
    if (speedRow) {
      speedRow.insertAdjacentHTML("afterend", `<div class="chars grid grid-2">${tempBox(actor)}<div></div></div>`);
      placed = true;
    }
  }
  if (!placed) return;

  const input = root.querySelector(".cs-temphp input");
  input.addEventListener("change", event => {
    event.stopPropagation();
    setTempHp(actor, input.value);
  });
});
