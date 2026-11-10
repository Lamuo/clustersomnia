import { mountPartyCards, refreshPartyCards, placeWithin } from "./union-meter.js";

const MODULE_ID = "clustersomnia";
const HOST_ID = "clustersomnia-mine";

// A GM has no PG of their own: the card follows the last selected party token, so deselecting doesn't blank it.
let gmActorId = null;

/** The PG this client's card shows: the user's own character, or for the GM the selected token's actor. */
function mine(party) {
  if (!game.settings.get(MODULE_ID, "unionShowMine")) return [];
  let actor = game.user.character;
  if (game.user.isGM) {
    const selected = canvas.tokens?.controlled.map(token => token.actor).find(a => party.some(p => p.id === (a?.baseActor?.id ?? a?.id)));
    if (selected) gmActorId = selected.baseActor?.id ?? selected.id;
    // Until a party token is selected, show Lady Diane.
    gmActorId ??= party.find(a => /diane/i.test(a.name))?.id ?? null;
    actor = game.actors.get(gmActorId);
  }
  return actor && party.includes(actor) ? [actor] : [];
}

function place(host) {
  const { left, top } = game.settings.get(MODULE_ID, "unionMinePosition");
  if (Number.isFinite(left) && Number.isFinite(top)) placeWithin(host, left, top);
  else if (!host.style.left && !host.style.top) {
    // First use: beside the sidebar, near the bottom.
    host.style.right = "330px";
    host.style.bottom = "120px";
  }
}

Hooks.once("ready", () => {
  const host = document.createElement("div");
  host.id = HOST_ID;
  document.body.appendChild(host);
  mountPartyCards(host, "unionMineScale", {
    extras: true,
    pick: mine,
    floating: { positionSetting: "unionMinePosition", showSetting: "unionShowMine" },
    onFilled: place
  });
});

// Who the card shows depends on the selection (GM) and on the character assigned to the user.
Hooks.on("controlToken", () => game.user.isGM && refreshPartyCards());
Hooks.on("updateUser", (user, changes) => {
  if (user.id === game.user.id && "character" in changes) refreshPartyCards();
});
