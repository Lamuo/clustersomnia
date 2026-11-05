import { mountPartyCards } from "./union-meter.js";

const MODULE_ID = "clustersomnia";

Hooks.once("init", () => {
  // Folded with the "Party" bar at the top of the tracker; kept per client.
  game.settings.register(MODULE_ID, "unionCombatCollapsed", {
    scope: "client", config: false, type: Boolean, default: false
  });
});

// The Combat Tracker replaces its whole content on every render (turns, rounds, its own controls). Building the
// party section anew each time threw the cards away and made them again, pictures included, which showed as a flash.
// So the section is made once and the same element is put back in place after each render: the cards are never
// rebuilt and nothing reloads or restarts.
let section = null;
let toggle = null;
let host = null;

function build() {
  section = document.createElement("section");
  section.classList.add("clustersomnia-party-wrap");

  toggle = document.createElement("button");
  toggle.type = "button";
  toggle.classList.add("cu-party-toggle");
  toggle.innerHTML = `<i class="fas fa-chevron-down"></i><span>Party</span>`;
  toggle.addEventListener("click", async () => {
    await game.settings.set(MODULE_ID, "unionCombatCollapsed", !game.settings.get(MODULE_ID, "unionCombatCollapsed"));
    ui.combat?.render();
  });

  host = document.createElement("div");
  host.classList.add("clustersomnia-party");
  section.append(toggle, host);
}

Hooks.on("renderCombatTracker", (app, html) => {
  if (!game.settings.get(MODULE_ID, "unionShowInCombat")) return;
  const root = html instanceof HTMLElement ? html : html[0];
  const list = root.querySelector("#combat-tracker");
  if (!list) return;

  if (!section) build();

  // Folded, the cards are hidden by CSS and the bar stays; the host keeps updating, which costs next to nothing.
  const collapsed = game.settings.get(MODULE_ID, "unionCombatCollapsed");
  section.classList.toggle("collapsed", collapsed);
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.firstElementChild.className = `fas fa-chevron-${collapsed ? "right" : "down"}`;

  list.before(section);
  // Registered again on every render: the host may have been dropped from the registry while it was detached.
  mountPartyCards(host, "unionCombatScale");
});
