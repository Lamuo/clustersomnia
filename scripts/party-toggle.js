const MODULE_ID = "clustersomnia";

// Four buttons in the scene controls (left column): one shows or hides the floating party stack (the multiple
// tracker), one the personal card (the single one), one the rules quickref window (quickref.js), one the party
// inventory (party-inventory.js). Each is the same
// per-client setting that the module settings expose, so the button and the setting always agree.
const TOGGLES = [
  {
    setting: "unionShow",
    id: "clustersomnia-party-toggle",
    icon: "fa-solid fa-users",
    on: "Party: nascondi il tracker",
    off: "Party: mostra il tracker"
  },
  {
    setting: "unionShowMine",
    id: "clustersomnia-mine-toggle",
    icon: "fa-solid fa-user",
    on: "Card personale: nascondi",
    off: "Card personale: mostra"
  },
  {
    setting: "quickrefShow",
    id: "clustersomnia-quickref-toggle",
    icon: "fa-solid fa-book-open",
    on: "Quickref regole: nascondi",
    off: "Quickref regole: mostra"
  },
  {
    setting: "inventoryShow",
    id: "clustersomnia-inventory-toggle",
    icon: "fa-solid fa-box-open",
    on: "Inventario di gruppo: nascondi",
    off: "Inventario di gruppo: mostra"
  }
];

function paint(button, toggle) {
  const on = game.settings.get(MODULE_ID, toggle.setting);
  button.classList.toggle("active", on);
  button.dataset.tooltip = on ? toggle.on : toggle.off;
  button.setAttribute("aria-pressed", String(on));
}

// The controls are rebuilt on every render, so the buttons are added again each time.
Hooks.on("renderSceneControls", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  const list = root.querySelector("ol.main-controls");
  if (!list) return;

  for (const toggle of TOGGLES) {
    const button = document.createElement("li");
    button.classList.add("scene-control", toggle.id);
    button.setAttribute("role", "button");
    button.innerHTML = `<i class="${toggle.icon}"></i>`;
    paint(button, toggle);
    button.addEventListener("click", async () => {
      await game.settings.set(MODULE_ID, toggle.setting, !game.settings.get(MODULE_ID, toggle.setting));
      paint(button, toggle);
    });
    list.append(button);
  }
});

// Anything else that changes a setting (the X on a window, the module settings) updates its button too. Foundry v12
// has no hook for client settings, only each setting's own `onChange`, so the repaint is chained onto that.
Hooks.once("ready", () => {
  for (const toggle of TOGGLES) {
    const setting = game.settings.settings.get(`${MODULE_ID}.${toggle.setting}`);
    if (!setting) continue;
    const onChange = setting.onChange;
    setting.onChange = (...args) => {
      onChange?.(...args);
      const button = document.querySelector(`#controls .${toggle.id}`);
      if (button) paint(button, toggle);
    };
  }
});
