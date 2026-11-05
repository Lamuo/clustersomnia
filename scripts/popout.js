const MODULE_ID = "clustersomnia";

// Element -> its browser window. The element itself moves into the window, so every hook and
// handler keeps working and it updates live; closing the window puts it back.
const windows = new Map();

/** Opens a popup at the place and size remembered under `key` (per client), with this page's styles and theme. */
function openWindow(key, fallback) {
  const saved = game.settings.get(MODULE_ID, "unionPopouts")[key] ?? {};
  const size = `width=${Math.round(saved.w ?? fallback.w)},height=${Math.round(saved.h ?? fallback.h)}`;
  const place = Number.isFinite(saved.x) ? `,left=${saved.x},top=${saved.y}` : "";
  const win = window.open("", `clustersomnia-${key}`, `popup=yes,${size}${place}`);
  if (!win) {
    ui.notifications.warn("Il browser ha bloccato la finestra: consenti i popup per questo sito.");
    return null;
  }

  const doc = win.document;
  doc.title = fallback.title;
  // The same stylesheets (module, Foundry, system and the @font-face of the skin's font) so everything looks identical.
  for (const node of document.head.querySelectorAll("link[rel=stylesheet], style")) {
    const copy = node.cloneNode(true);
    if (node.href) copy.href = node.href;
    doc.head.append(copy);
  }
  doc.body.className = document.body.className;
  const base = doc.createElement("style");
  base.textContent = "html, body { margin: 0; height: 100%; overflow: hidden; background: #120d0c; }";
  doc.head.append(base);
  return win;
}

/** Remembers where the popup was left, so it reopens there (on the second screen). */
function rememberWindow(key, win) {
  return game.settings.set(MODULE_ID, "unionPopouts", {
    ...game.settings.get(MODULE_ID, "unionPopouts"),
    [key]: { x: win.screenX, y: win.screenY, w: win.innerWidth, h: win.innerHeight }
  });
}

/**
 * Moves a floating card into its own browser window (to park it on a second screen).
 * The card is fitted to the window.
 */
export function popOut(el, key, onDock) {
  const existing = windows.get(el);
  if (existing) return existing.focus();

  const box = el.getBoundingClientRect();
  const win = openWindow(key, { w: Math.ceil(box.width) + 24, h: Math.ceil(box.height) + 24, title: "Party" });
  if (!win) return;
  const doc = win.document;

  el.classList.add("cu-detached");
  doc.body.append(el);

  // `zoom` scales every pixel of the card (fixed gaps included), so it can be fitted to any window size.
  let last = "";
  const fit = () => {
    doc.body.style.zoom = 1;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    if (!width || !height) return;
    const zoom = Math.min(win.innerWidth / width, win.innerHeight / height);
    doc.body.style.zoom = zoom;
    last = `${width}|${height}|${win.innerWidth}|${win.innerHeight}`;
  };
  const observer = new win.ResizeObserver(() => {
    const now = `${el.offsetWidth}|${el.offsetHeight}|${win.innerWidth}|${win.innerHeight}`;
    if (now !== last) fit();
  });
  observer.observe(el);
  win.addEventListener("resize", fit);
  fit();

  const closeWithMain = () => win.close();
  window.addEventListener("beforeunload", closeWithMain);

  win.addEventListener("pagehide", () => {
    observer.disconnect();
    window.removeEventListener("beforeunload", closeWithMain);
    windows.delete(el);
    rememberWindow(key, win);
    el.classList.remove("cu-detached");
    el.style.removeProperty("zoom");
    document.body.append(el);
    onDock?.();
  });

  windows.set(el, win);
  return win;
}

/** Closes the window of a card that is going away, if it has one. */
export function closePopout(el) {
  windows.get(el)?.close();
}

/**
 * Moves an open Foundry window (a sheet) into its own browser window; the window then fills it.
 * Whatever such a window opens (dialogs, context menus, item sheets) still appears in the main window.
 */
export function popOutApp(app) {
  const el = app.element?.[0];
  if (!el) return;
  const existing = windows.get(el);
  if (existing) return existing.focus();

  const win = openWindow("sheet", { w: app.position.width ?? 700, h: app.position.height ?? 800, title: app.title });
  if (!win) return;

  el.classList.add("cu-app-detached");
  win.document.body.append(el);

  // The browser's own right-click menu is useless here and pops up over right-click controls (ammo -1, etc.);
  // only the default is cancelled, so the sheet's own contextmenu handlers still run.
  win.document.addEventListener("contextmenu", event => event.preventDefault());

  const closeWithMain = () => win.close();
  window.addEventListener("beforeunload", closeWithMain);
  // A sheet closed while detached takes its browser window with it (the hook is the one of its own class).
  const hookName = `close${app.constructor.name}`;
  const hookId = Hooks.on(hookName, closing => { if (closing === app) win.close(); });

  win.addEventListener("pagehide", () => {
    window.removeEventListener("beforeunload", closeWithMain);
    Hooks.off(hookName, hookId);
    windows.delete(el);
    rememberWindow("sheet", win);
    el.classList.remove("cu-app-detached");
    // The sheet may have been closed while detached; only a live one goes back to the page.
    if (app.rendered) {
      document.body.append(el);
      app.setPosition({});
    }
  });

  windows.set(el, win);
  return win;
}

/** The browser window a Foundry window is detached into, if any. */
export function appWindow(app) {
  return app.element?.[0] ? windows.get(app.element[0]) : undefined;
}
