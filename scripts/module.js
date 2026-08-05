import { TrackerApp } from "./tracker-app.js";

const FLAG_NAMESPACE = "my-tracker";

Hooks.once("init", () => {
  console.log(`${FLAG_NAMESPACE} | Initializing SotDL Tracker`);
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
