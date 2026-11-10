import { floatingWindow } from "./quickref.js";

const MODULE_ID = "clustersomnia";
const FLAG_NAMESPACE = "clustersomnia";
// What a dragged inventory folder carries; anything else dropped here is Foundry's own drag data.
const FOLDER_DRAG = "ClustersomniaInventoryFolder";

/**
 * The party inventory is a real actor (flag `partyInventory`), owned by everyone: its items are ordinary system
 * items, so sheets, drag and drop and compendium imports all work as on any character. Folders don't exist for
 * embedded items, so they are the module's own: a list on the actor (`folders`) and a `folder` flag on each item.
 */
function inventoryActor() {
  return game.actors.find(actor => actor.getFlag(FLAG_NAMESPACE, "partyInventory"));
}

const foldersOf = actor => foundry.utils.deepClone(actor.getFlag(FLAG_NAMESPACE, "folders") ?? []);
const saveFolders = (actor, folders) => actor.setFlag(FLAG_NAMESPACE, "folders", folders);
const folderOf = item => item.getFlag(FLAG_NAMESPACE, "folder") ?? null;
const escape = text => Handlebars.Utils.escapeExpression(text ?? "");
const byName = (a, b) => a.name.localeCompare(b.name, game.i18n.lang, { numeric: true });
const typeLabel = item => game.i18n.localize(CONFIG.Item.typeLabels?.[item.type] ?? item.type);
const hasQuantity = item => item.system && "quantity" in item.system;

/** A folder and every folder inside it. */
function withDescendants(folders, id) {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (ids.has(folder.parent) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}

const collapsed = () => new Set(game.settings.get(MODULE_ID, "inventoryCollapsed").ids ?? []);

/* -------------------------------------------- */
/*  Drawing                                      */
/* -------------------------------------------- */

function itemMarkup(item, canEdit) {
  const quantity = hasQuantity(item)
    ? `<span class="ci-qty">
        <button type="button" data-action="dec" title="Uno in meno" ${canEdit ? "" : "disabled"}>−</button>
        <input type="number" min="0" step="1" value="${Number(item.system.quantity) || 0}" title="Quantità" ${canEdit ? "" : "disabled"}>
        <button type="button" data-action="inc" title="Uno in più" ${canEdit ? "" : "disabled"}>+</button>
      </span>`
    : "";
  return `<li class="ci-item" draggable="true" data-item-id="${item.id}">
    <img src="${escape(item.img)}" alt="" draggable="false">
    <a class="ci-name" data-action="open" title="Apri la scheda">${escape(item.name)}</a>
    <span class="ci-type">${escape(typeLabel(item))}</span>
    ${quantity}
    ${canEdit ? `<button type="button" class="ci-icon" data-action="delete" title="Elimina"><i class="fas fa-trash"></i></button>` : ""}
  </li>`;
}

function folderMarkup(folder, tree, canEdit, closed, searching) {
  const inner = branchMarkup(folder.id, tree, canEdit, closed, searching);
  // While searching, a folder with nothing left to show is dropped, and the others are opened.
  if (searching && !inner) return "";
  const isClosed = !searching && closed.has(folder.id);
  const tools = canEdit
    ? `<button type="button" class="ci-icon" data-action="add-item" title="Nuovo oggetto in questa cartella"><i class="fas fa-plus"></i></button>
       <button type="button" class="ci-icon" data-action="add-folder" title="Nuova sottocartella"><i class="fas fa-folder-plus"></i></button>
       <button type="button" class="ci-icon" data-action="rename" title="Rinomina"><i class="fas fa-pen"></i></button>
       <button type="button" class="ci-icon" data-action="delete-folder" title="Elimina la cartella (il contenuto sale di un livello)"><i class="fas fa-trash"></i></button>`
    : "";
  return `<li class="ci-folder${isClosed ? " closed" : ""}" data-folder-id="${folder.id}">
    <div class="ci-folder-head" draggable="true">
      <a class="ci-folder-name" data-action="toggle"><i class="fas ${isClosed ? "fa-folder" : "fa-folder-open"}"></i> <span>${escape(folder.name)}</span></a>
      <span class="ci-count">${tree.count(folder.id)}</span>
      ${tools}
    </div>
    <ul>${inner}</ul>
  </li>`;
}

function branchMarkup(parent, tree, canEdit, closed, searching) {
  const folders = tree.folders.filter(folder => folder.parent === parent).sort(byName)
    .map(folder => folderMarkup(folder, tree, canEdit, closed, searching)).join("");
  const items = tree.items.filter(item => item.folder === parent).sort((a, b) => byName(a.item, b.item))
    .map(entry => itemMarkup(entry.item, canEdit)).join("");
  return folders + items;
}

function draw(body) {
  const list = body.querySelector(".ci-list");
  const actor = inventoryActor();
  const canEdit = Boolean(actor?.isOwner);
  for (const el of body.querySelectorAll(".ci-toolbar button")) el.disabled = !canEdit;
  if (!actor) {
    list.innerHTML = `<li class="ci-empty">L'inventario di gruppo non esiste ancora: si crea da solo la prima volta che il GM apre il mondo.</li>`;
    return;
  }

  const query = body.querySelector(".ci-search").value.trim().toLowerCase();
  const known = new Set(foldersOf(actor).map(folder => folder.id));
  // A folder or an item pointing at a folder that is gone sits at the top level.
  const folders = foldersOf(actor).map(folder => ({ ...folder, parent: known.has(folder.parent) ? folder.parent : null }));
  const items = actor.items
    .filter(item => !query || item.name.toLowerCase().includes(query))
    .map(item => ({ item, folder: known.has(folderOf(item)) ? folderOf(item) : null }));
  const tree = {
    folders, items,
    count: id => {
      const inside = withDescendants(folders, id);
      return items.filter(entry => inside.has(entry.folder)).length;
    }
  };

  const scroll = list.scrollTop;
  const markup = branchMarkup(null, tree, canEdit, collapsed(), Boolean(query));
  list.innerHTML = markup || `<li class="ci-empty">${query
    ? "Nessun oggetto con questo nome."
    : "Vuoto. Trascina qui un oggetto da un compendio, da una scheda o dalla barra laterale, oppure creane uno nuovo."}</li>`;
  list.scrollTop = scroll;
}

/* -------------------------------------------- */
/*  Actions                                      */
/* -------------------------------------------- */

/** Foundry's own "create item" dialog (name and type), then the system's sheet opens on the new item. */
function createItem(actor, folder) {
  return Item.implementation.createDialog(
    { flags: { [FLAG_NAMESPACE]: { folder } } },
    { parent: actor }
  );
}

async function createFolder(actor, parent, body) {
  const folders = foldersOf(actor);
  const id = foundry.utils.randomID();
  folders.push({ id, name: "Nuova cartella", parent });
  // A folded parent is opened, or the new folder would be born out of sight.
  if (parent && collapsed().has(parent)) await toggleFolder(parent);
  await saveFolders(actor, folders);
  // Straight into renaming, as soon as the new row is drawn.
  body.dataset.rename = id;
  draw(body);
  startRename(body, id);
}

/** Deleting a folder never deletes what is inside: items and subfolders move up one level. */
async function deleteFolder(actor, id) {
  const folders = foldersOf(actor);
  const gone = folders.find(folder => folder.id === id);
  if (!gone) return;
  const parent = gone.parent ?? null;
  const updates = actor.items.filter(item => folderOf(item) === id)
    .map(item => ({ _id: item.id, [`flags.${FLAG_NAMESPACE}.folder`]: parent }));
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  await saveFolders(actor, folders.filter(folder => folder.id !== id)
    .map(folder => folder.parent === id ? { ...folder, parent } : folder));
}

function startRename(body, id) {
  delete body.dataset.rename;
  const label = body.querySelector(`.ci-folder[data-folder-id="${id}"] > .ci-folder-head .ci-folder-name span`);
  if (!label) return;
  const input = label.ownerDocument.createElement("input");
  input.type = "text";
  input.className = "ci-rename";
  input.value = label.textContent;
  label.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async save => {
    if (done) return;
    done = true;
    const actor = inventoryActor();
    const name = input.value.trim();
    if (save && actor && name) {
      await saveFolders(actor, foldersOf(actor).map(folder => folder.id === id ? { ...folder, name } : folder));
    }
    draw(body);
  };
  input.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Enter") finish(true);
    else if (event.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
  // Clicking in the field must not fold the folder or start a drag.
  input.addEventListener("click", event => event.stopPropagation());
}

async function toggleFolder(id) {
  const ids = collapsed();
  if (!ids.delete(id)) ids.add(id);
  await game.settings.set(MODULE_ID, "inventoryCollapsed", { ids: [...ids] });
}

function setQuantity(item, value) {
  const quantity = Math.max(0, Math.round(Number(value) || 0));
  if (quantity !== Number(item.system.quantity)) return item.update({ "system.quantity": quantity });
}

async function onClick(event, body) {
  const control = event.target.closest("[data-action]");
  if (!control || !body.contains(control)) return;
  const actor = inventoryActor();
  if (!actor) return;
  const action = control.dataset.action;
  const item = actor.items.get(control.closest(".ci-item")?.dataset.itemId);
  const folder = control.closest(".ci-folder")?.dataset.folderId ?? null;

  switch (action) {
    case "open": return item?.sheet.render(true);
    case "inc": return item && setQuantity(item, Number(item.system.quantity) + 1);
    case "dec": return item && setQuantity(item, Number(item.system.quantity) - 1);
    // Foundry's own confirmation, as on a sheet.
    case "delete": return item?.deleteDialog();
    case "new-item": return createItem(actor, null);
    case "new-folder": return createFolder(actor, null, body);
    case "add-item": return createItem(actor, folder);
    case "add-folder": return createFolder(actor, folder, body);
    case "rename": return startRename(body, folder);
    case "delete-folder": return deleteFolder(actor, folder);
    case "toggle": await toggleFolder(folder); return draw(body);
  }
}

/* -------------------------------------------- */
/*  Drag and drop                                */
/* -------------------------------------------- */

function onDragStart(event, body) {
  const actor = inventoryActor();
  if (!actor) return;
  const row = event.target.closest(".ci-item");
  if (row) {
    // The same data a sheet would give, so the item can be dropped on any sheet, the hotbar, a journal…
    const item = actor.items.get(row.dataset.itemId);
    if (item) event.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
    return;
  }
  const head = event.target.closest(".ci-folder-head");
  if (head) {
    event.dataTransfer.setData("text/plain", JSON.stringify({
      type: FOLDER_DRAG, id: head.closest(".ci-folder").dataset.folderId
    }));
  }
}

let dropTarget = null;
function mark(el) {
  if (dropTarget === el) return;
  dropTarget?.classList.remove("ci-drop");
  dropTarget = el;
  dropTarget?.classList.add("ci-drop");
}

async function onDrop(event, body) {
  event.preventDefault();
  mark(null);
  const actor = inventoryActor();
  if (!actor?.isOwner) return;
  const data = TextEditor.getDragEventData(event);
  const target = event.target.closest(".ci-folder")?.dataset.folderId ?? null;

  if (data.type === FOLDER_DRAG) {
    const folders = foldersOf(actor);
    // A folder can't go inside itself or inside one of its own subfolders.
    if (withDescendants(folders, data.id).has(target)) return;
    return saveFolders(actor, folders.map(folder => folder.id === data.id ? { ...folder, parent: target } : folder));
  }

  if (data.type !== "Item") return;
  const item = await Item.implementation.fromDropData(data);
  if (!item) return;
  // Already here: it only changes folder. Anything else (compendium, sidebar, another sheet) is copied in.
  if (item.parent?.id === actor.id) {
    if (folderOf(item) !== target) await item.update({ [`flags.${FLAG_NAMESPACE}.folder`]: target });
    return;
  }
  const source = item.toObject();
  delete source._id;
  foundry.utils.setProperty(source, `flags.${FLAG_NAMESPACE}.folder`, target);
  await actor.createEmbeddedDocuments("Item", [source]);
}

function wire(body) {
  body.addEventListener("click", event => onClick(event, body));
  body.addEventListener("change", event => {
    const input = event.target.closest(".ci-qty input");
    const item = inventoryActor()?.items.get(input?.closest(".ci-item")?.dataset.itemId);
    if (item) setQuantity(item, input.value);
  });
  body.querySelector(".ci-search").addEventListener("input", () => draw(body));
  body.addEventListener("dragstart", event => onDragStart(event, body));
  body.addEventListener("dragover", event => {
    event.preventDefault();
    mark(event.target.closest(".ci-folder") ?? body.querySelector(".ci-list"));
  });
  body.addEventListener("dragleave", event => {
    if (!body.contains(event.relatedTarget)) mark(null);
  });
  body.addEventListener("drop", event => onDrop(event, body));
}

/* -------------------------------------------- */
/*  The window                                   */
/* -------------------------------------------- */

let panel = null;
const redraw = foundry.utils.debounce(() => {
  // A rename in progress is left alone; it redraws when it ends.
  if (panel && !panel.querySelector(".ci-rename")) draw(panel);
}, 50);

const showInventory = floatingWindow({
  id: "clustersomnia-inventory",
  showSetting: "inventoryShow",
  boxSetting: "inventoryBox",
  popoutKey: "inventory",
  title: "Inventario di gruppo",
  size: { width: 400, height: 520, minWidth: 300, minHeight: 220 },
  corner: { right: 330, top: 120 },
  content: `<div class="ci-panel">
      <div class="ci-toolbar">
        <strong>Inventario di gruppo</strong>
        <input type="search" class="ci-search" placeholder="Cerca…" aria-label="Cerca un oggetto">
        <button type="button" data-action="new-item" title="Nuovo oggetto"><i class="fas fa-plus"></i> Oggetto</button>
        <button type="button" data-action="new-folder" title="Nuova cartella"><i class="fas fa-folder-plus"></i> Cartella</button>
      </div>
      <ul class="ci-list"></ul>
    </div>`,
  buttons: [
    {
      icon: "fas fa-xmark",
      title: "Chiudi l'inventario (si riapre dal pulsante nei controlli a sinistra)",
      click: () => game.settings.set(MODULE_ID, "inventoryShow", false)
    }
  ],
  onShow: host => {
    if (!panel) {
      panel = host.querySelector(".ci-panel");
      wire(panel);
    }
    draw(panel);
  }
});

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "inventoryShow", {
    name: "Inventario di gruppo: mostra la finestra",
    hint: "Gli oggetti non ancora divisi tra i personaggi. Vi si trascinano oggetti da compendi e schede, e da qui sulle schede.",
    scope: "client", config: true, type: Boolean, default: false, onChange: showInventory
  });
  game.settings.register(MODULE_ID, "inventoryBox", { scope: "client", config: false, type: Object, default: {} });
  // Which folders this client keeps folded.
  game.settings.register(MODULE_ID, "inventoryCollapsed", {
    scope: "client", config: false, type: Object, default: { ids: [] }
  });
});

// The inventory actor is made once, by the active GM, and handed to everyone as owner so players can edit it.
Hooks.once("ready", async () => {
  if (inventoryActor() || game.users.activeGM !== game.user) return;
  const types = game.documentTypes.Actor.filter(type => type !== "base");
  await Actor.implementation.create({
    name: "Inventario di gruppo",
    // A vehicle is the system's plain container: no paths, ancestry or union talent to get in the way.
    type: types.includes("vehicle") ? "vehicle" : types[0],
    img: "icons/svg/chest.svg",
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    flags: { [FLAG_NAMESPACE]: { partyInventory: true, folders: [] } }
  });
});

const isInventory = actor => Boolean(actor?.getFlag?.(FLAG_NAMESPACE, "partyInventory"));
for (const hook of ["createItem", "updateItem", "deleteItem"]) {
  Hooks.on(hook, item => { if (isInventory(item.parent)) redraw(); });
}
for (const hook of ["createActor", "updateActor", "deleteActor"]) {
  Hooks.on(hook, actor => { if (isInventory(actor)) redraw(); });
}
