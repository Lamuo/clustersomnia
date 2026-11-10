import { TrackerApp } from "./tracker-app.js";
import "./folder-permissions.js";
import "./folder-relay.js";
import "./compendium-filters.js";
import "./union-meter.js";
import "./combat-party.js";
import "./personal-card.js";
import "./sheet-popout.js";
import "./quickref.js";
import "./party-inventory.js";
import "./party-toggle.js";
import "./weapon-size-damage.js";
import "./health-guard.js";
import "./roll-dialog.js";
import "./temp-hp.js";
import "./token-bar.js";
import "./alsa.js";
import "./alsa-weapons.js";

const FLAG_NAMESPACE = "clustersomnia";
const LEGACY_FLAG_NAMESPACE = "my-tracker";

Hooks.once("init", () => {
  console.log(`${FLAG_NAMESPACE} | Initializing SotDL Tracker`);
});

// One-time migration: tracker data used to live under the standalone
// "my-tracker" module's flag scope. That module no longer exists, so
// Foundry rejects reads/writes against it — copy any leftover data across.
Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  for (const actor of game.actors) {
    const legacy = foundry.utils.getProperty(actor, `flags.${LEGACY_FLAG_NAMESPACE}`);
    if (!legacy) continue;

    const updates = {};
    if (legacy.counters !== undefined && foundry.utils.getProperty(actor, `flags.${FLAG_NAMESPACE}.counters`) === undefined) {
      updates[`flags.${FLAG_NAMESPACE}.counters`] = legacy.counters;
    }
    if (legacy.displayedEffectIds !== undefined && foundry.utils.getProperty(actor, `flags.${FLAG_NAMESPACE}.displayedEffectIds`) === undefined) {
      updates[`flags.${FLAG_NAMESPACE}.displayedEffectIds`] = legacy.displayedEffectIds;
    }
    if (Object.keys(updates).length) {
      await actor.update(updates);
    }
  }
});

Hooks.on("renderTokenHUD", (hud, html, _data) => {
  const actor = hud.object?.actor;
  if (!actor) return;

  const root = html instanceof HTMLElement ? html : html[0];

  const button = document.createElement("div");
  button.classList.add("control-icon", "sotdl-tracker-hud-button");
  button.dataset.tooltip = "Open Tracker";
  button.innerHTML = `<img src="icons/svg/regen.svg" width="36" height="36">`;
  button.addEventListener("click", () => {
    new TrackerApp(actor).render(true);
  });

  const column = root.querySelector(".col.right") ?? root.querySelector(".col.left");
  column?.appendChild(button);
});
