import { placeWithin } from "./union-meter.js";
import { popOut, closePopout } from "./popout.js";

const MODULE_ID = "clustersomnia";
const QUICKREF_FILE = `modules/${MODULE_ID}/quickref/sotdl-quickref-cluster-v2.html`;
const MANUAL_FILE = `modules/${MODULE_ID}/regole/clustersomnia-regolamento.md`;

/** Saves a file of the module as it is on disk (same origin, so the `download` attribute is honoured). */
function download(path) {
  saveFile(foundry.utils.getRoute(path), path.split("/").pop());
}

function saveFile(url, name) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * A floating window with the party cards' grip, popout button and corner handle (styled by .cu-floating), plus
 * its own row of small buttons. Unlike the cards, the handle sets a real width and height: the content reflows.
 * Shown while the client setting `showSetting` is on; where it sits and how big is kept in `boxSetting`.
 */
export function floatingWindow({ id, showSetting, boxSetting, popoutKey, title, size, corner, content, buttons, onShow }) {
  let host = null;

  function place() {
    const box = game.settings.get(MODULE_ID, boxSetting);
    host.style.width = `${Math.min(box.width ?? size.width, window.innerWidth)}px`;
    host.style.height = `${Math.min(box.height ?? size.height, window.innerHeight - 40)}px`;
    if (Number.isFinite(box.left) && Number.isFinite(box.top)) placeWithin(host, box.left, box.top);
    else {
      // First use: beside the sidebar.
      host.style.left = host.style.bottom = "auto";
      host.style.right = `${corner.right}px`;
      host.style.top = `${corner.top}px`;
      // On a narrow window that corner can fall off the left edge: pull it back in.
      const box = host.getBoundingClientRect();
      if (box.left < 0) placeWithin(host, 0, box.top);
    }
  }

  function save() {
    const box = host.getBoundingClientRect();
    return game.settings.set(MODULE_ID, boxSetting, {
      left: Math.round(box.left), top: Math.round(box.top),
      width: Math.round(box.width), height: Math.round(box.height)
    });
  }

  /** Follows a drag of `handle` with the pointer captured, so an iframe underneath never swallows the moves. */
  function track(handle, start) {
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      const move = start(event);
      handle.setPointerCapture(event.pointerId);
      host.classList.add("dragging");
      const stop = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", stop);
        handle.removeEventListener("pointercancel", stop);
        host.classList.remove("dragging");
        save();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
    });
  }

  function build() {
    host = document.createElement("div");
    host.id = id;
    host.classList.add("cu-floating", "cq-host");
    host.hidden = true;
    const extra = buttons.map((button, index) =>
      `<button type="button" class="cq-btn" style="--i:${index + 1}" data-button="${index}" title="${button.title}"><i class="${button.icon}"></i></button>`
    ).join("");
    host.innerHTML = `<div class="cu-grip" title="Trascina per spostare, doppio clic per ripristinare"><i class="fas fa-grip"></i></div>
      <button type="button" class="cu-popout" title="Stacca in una finestra (per il secondo schermo)"><i class="fas fa-up-right-from-square"></i></button>
      ${extra}${content}
      <div class="cu-resize" title="Trascina per ridimensionare, doppio clic per ripristinare"></div>`;
    document.body.appendChild(host);

    const grip = host.querySelector(".cu-grip");
    track(grip, event => {
      const box = host.getBoundingClientRect();
      const dx = event.clientX - box.left;
      const dy = event.clientY - box.top;
      return e => placeWithin(host, e.clientX - dx, e.clientY - dy);
    });

    const handle = host.querySelector(".cu-resize");
    track(handle, () => {
      const box = host.getBoundingClientRect();
      // Pin the top-left corner so the window grows right and down from where it is.
      host.style.right = host.style.bottom = "auto";
      host.style.left = `${box.left}px`;
      host.style.top = `${box.top}px`;
      return e => {
        const width = Math.min(e.clientX - box.left, window.innerWidth - box.left - 4);
        const height = Math.min(e.clientY - box.top, window.innerHeight - box.top - 24);
        host.style.width = `${Math.max(size.minWidth, width)}px`;
        host.style.height = `${Math.max(size.minHeight, height)}px`;
      };
    });

    const reset = async () => {
      await game.settings.set(MODULE_ID, boxSetting, {});
      place();
    };
    grip.addEventListener("dblclick", reset);
    handle.addEventListener("dblclick", reset);

    // Detached, the window is filled instead of fitted with a zoom.
    host.querySelector(".cu-popout").addEventListener("click", () => {
      popOut(host, popoutKey, place, { title, fill: true });
    });
    for (const el of host.querySelectorAll(".cq-btn")) {
      el.addEventListener("click", () => buttons[Number(el.dataset.button)].click());
    }
  }

  function show() {
    if (!host) return;
    const on = game.settings.get(MODULE_ID, showSetting);
    if (!on) closePopout(host);
    host.hidden = !on;
    if (!on) return;
    onShow(host);
    place();
  }

  Hooks.once("ready", () => {
    build();
    show();
  });

  return show;
}

const toggle = setting => game.settings.set(MODULE_ID, setting, !game.settings.get(MODULE_ID, setting));

/* -------------------------------------------- */
/*  The quickref: the standalone page, embedded  */
/* -------------------------------------------- */

const showQuickref = floatingWindow({
  id: "clustersomnia-quickref",
  showSetting: "quickrefShow",
  boxSetting: "quickrefBox",
  popoutKey: "quickref",
  title: "Quickref",
  size: { width: 420, height: 560, minWidth: 280, minHeight: 240 },
  corner: { right: 330, top: 80 },
  content: `<iframe title="Quickref delle regole"></iframe>`,
  buttons: [
    { icon: "fas fa-download", title: "Scarica il quickref (file HTML)", click: () => download(QUICKREF_FILE) },
    { icon: "fas fa-book", title: "Manuale: apri o chiudi il regolamento completo", click: () => toggle("manualShow") },
    { icon: "fas fa-xmark", title: "Chiudi il quickref (si riapre dal pulsante nei controlli a sinistra)", click: () => toggle("quickrefShow") }
  ],
  // The page is loaded only the first time the window is shown. `embed=1` makes it transparent and always dark,
  // and keeps its popups out of the browser history.
  onShow: host => {
    const frame = host.querySelector("iframe");
    if (!frame.getAttribute("src")) frame.src = foundry.utils.getRoute(`${QUICKREF_FILE}?embed=1`);
  }
});

/* -------------------------------------------- */
/*  Union abilities: just that block of the quickref  */
/* -------------------------------------------- */

// The same page, `only=union`: the pair picker (Vigoroso, Rapido...) and the ten abilities, nothing else.
const showUnionRules = floatingWindow({
  id: "clustersomnia-unionrules",
  showSetting: "unionRulesShow",
  boxSetting: "unionRulesBox",
  popoutKey: "unionrules",
  title: "Abilità Unione",
  size: { width: 360, height: 300, minWidth: 260, minHeight: 200 },
  corner: { right: 330, top: 160 },
  content: `<iframe title="Abilità Unione"></iframe>`,
  buttons: [
    { icon: "fas fa-xmark", title: "Chiudi le abilità Unione (si riaprono dal pulsante nei controlli a sinistra)", click: () => toggle("unionRulesShow") }
  ],
  onShow: host => {
    const frame = host.querySelector("iframe");
    if (!frame.getAttribute("src")) frame.src = foundry.utils.getRoute(`${QUICKREF_FILE}?embed=1&only=union`);
  }
});

/* -------------------------------------------- */
/*  The manual: the rulebook markdown, rendered  */
/* -------------------------------------------- */

/** The anchor a heading gets on GitHub, which is what the rulebook's own index links to. */
const slug = text => text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-");

let manualCache = null;

/** The rulebook as HTML, fetched and converted once per session. */
function manualHtml() {
  manualCache ??= (async () => {
    const response = await fetch(foundry.utils.getRoute(MANUAL_FILE));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();
    // Foundry ships showdown (it renders markdown journal pages). No header ids: they would land in Foundry's own page.
    const converter = new showdown.Converter({ ...CONST.SHOWDOWN_OPTIONS, tables: true, noHeaderId: true });
    return converter.makeHtml(markdown);
  })().catch(error => {
    manualCache = null;
    throw error;
  });
  return manualCache;
}

async function renderManual(host) {
  const body = host.querySelector(".cq-manual");
  if (body.dataset.loaded) return;
  body.dataset.loaded = "1";
  try {
    body.innerHTML = await manualHtml();
  } catch (error) {
    delete body.dataset.loaded;
    body.textContent = `Non riesco a caricare il regolamento (${error.message}).`;
  }
}

// The downloaded rulebook is one self-contained page: dark or light with the reader's browser, plain on paper.
const MANUAL_PAGE_CSS = `
:root{--bg:#121016;--ink:#e8e4dc;--muted:#b5ada0;--line:#38333c;--accent:#e06a5a;color-scheme:dark}
@media (prefers-color-scheme:light){:root{--bg:#f4f1ea;--ink:#211d18;--muted:#6b6357;--line:#d8d0c0;--accent:#a02222;color-scheme:light}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "Source Sans 3",Candara,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:28px 20px 60px}
h1,h2,h3,h4{line-height:1.2;margin:1.4em 0 .5em}
h1{margin-top:0;font-size:2rem}
h2{font-size:1.5rem;color:var(--accent);border-bottom:1px solid var(--line);padding-bottom:.2em}
h3{font-size:1.2rem}
h4{font-size:1rem;color:var(--muted)}
p,ul,ol{margin:0 0 .8em}
ul,ol{padding-left:1.5em}
li{margin-bottom:.25em}
a{color:var(--accent)}
hr{border:0;border-top:1px solid var(--line);margin:1.6em 0}
.table{overflow-x:auto;margin:0 0 1em}
table{border-collapse:collapse;width:100%;font-size:.93rem}
th,td{padding:.35em .55em;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
th{color:var(--muted)}
@media print{
  :root{--bg:#fff;--ink:#000;--muted:#444;--line:#bbb;--accent:#7a1414}
  main{max-width:none;padding:0}
  .table{overflow:visible}
  h2,h3,h4{break-after:avoid}
  tr{break-inside:avoid}
}`;

/** Saves the rendered rulebook as a standalone HTML page, its index links working inside the file. */
async function downloadManual() {
  let html;
  try {
    html = await manualHtml();
  } catch (error) {
    return ui.notifications.error(`Non riesco a preparare il regolamento (${error.message}).`);
  }
  const holder = document.createElement("div");
  holder.innerHTML = html;
  for (const heading of holder.querySelectorAll("h1, h2, h3, h4")) heading.id = slug(heading.textContent);
  // Wide tables scroll on their own on a phone instead of stretching the page.
  for (const table of holder.querySelectorAll("table")) {
    const wrap = document.createElement("div");
    wrap.className = "table";
    table.replaceWith(wrap);
    wrap.append(table);
  }
  const title = holder.querySelector("h1")?.textContent ?? "Regolamento";
  const page = `<!doctype html>
<html lang="it">
<meta charset="utf-8">
<title>${Handlebars.Utils.escapeExpression(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${MANUAL_PAGE_CSS}
</style>
<main>
${holder.innerHTML}
</main>
</html>
`;
  const url = URL.createObjectURL(new Blob([page], { type: "text/html;charset=utf-8" }));
  saveFile(url, MANUAL_FILE.split("/").pop().replace(/\.md$/, ".html"));
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const showManual = floatingWindow({
  id: "clustersomnia-manual",
  showSetting: "manualShow",
  boxSetting: "manualBox",
  popoutKey: "manual",
  title: "Manuale",
  size: { width: 620, height: 640, minWidth: 320, minHeight: 240 },
  corner: { right: 770, top: 80 },
  content: `<div class="cq-manual">Carico il regolamento…</div>`,
  buttons: [
    { icon: "fas fa-download", title: "Scarica il regolamento (pagina HTML)", click: downloadManual },
    { icon: "fas fa-xmark", title: "Chiudi il manuale", click: () => toggle("manualShow") }
  ],
  onShow: host => {
    const body = host.querySelector(".cq-manual");
    if (!body.dataset.wired) {
      body.dataset.wired = "1";
      // The index links (#1-fondamenti…) scroll inside the window, without touching Foundry's address.
      body.addEventListener("click", event => {
        const link = event.target.closest("a[href^='#']");
        if (!link) return;
        event.preventDefault();
        const wanted = decodeURIComponent(link.getAttribute("href").slice(1));
        const heading = [...body.querySelectorAll("h1, h2, h3, h4")].find(h => slug(h.textContent) === wanted);
        heading?.scrollIntoView({ block: "start" });
      });
    }
    renderManual(host);
  }
});

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "quickrefShow", {
    name: "Quickref: mostra la finestra delle regole",
    hint: "Finestra flottante e trasparente con il riassunto delle regole. Si sposta dalla linguetta in alto e si stacca in una finestra a parte; da lì si apre anche il manuale completo.",
    scope: "client", config: true, type: Boolean, default: false, onChange: showQuickref
  });
  game.settings.register(MODULE_ID, "unionRulesShow", {
    name: "Abilità Unione: mostra la finestra",
    hint: "Solo il blocco Unione del quickref: scegli le due Specializzazioni e vedi l'abilità, con le regole di ciascuna.",
    scope: "client", config: true, type: Boolean, default: false, onChange: showUnionRules
  });
  // Opened and closed from the quickref's own button.
  game.settings.register(MODULE_ID, "manualShow", {
    scope: "client", config: false, type: Boolean, default: false, onChange: showManual
  });
  // Where this client left each window and how big: { left, top, width, height }.
  for (const key of ["quickrefBox", "manualBox", "unionRulesBox"]) {
    game.settings.register(MODULE_ID, key, { scope: "client", config: false, type: Object, default: {} });
  }
});
