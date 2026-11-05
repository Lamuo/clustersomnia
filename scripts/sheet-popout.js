import { popOutApp, appWindow } from "./popout.js";

// One header button on every actor sheet (the PG sheet included): detach it into its own browser window,
// or, when it is already detached, bring it back.
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  buttons.unshift({
    label: "",
    class: "clustersomnia-popout",
    icon: "fas fa-up-right-from-square",
    onclick: () => {
      const win = appWindow(sheet);
      if (win) win.close();
      else popOutApp(sheet);
    }
  });
});
