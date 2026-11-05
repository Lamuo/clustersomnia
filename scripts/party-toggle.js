const MODULE_ID = "clustersomnia";

// Two buttons in the scene controls (left column): one shows or hides the floating party stack (the multiple
// tracker), the other the personal card (the single one). Each is the same per-client setting that the module
// settings expose, so the button and the setting always agree.
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

// Changing either from the module settings updates its button too.
Hooks.on("clientSettingChanged", key => {
  for (const toggle of TOGGLES) {
    if (key !== `${MODULE_ID}.${toggle.setting}`) continue;
    const button = document.querySelector(`#controls .${toggle.id}`);
    if (button) paint(button, toggle);
  }
});
