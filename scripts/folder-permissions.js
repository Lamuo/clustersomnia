const FLAG_NAMESPACE = "clustersomnia";

function scopedOwnership(userId) {
  return { default: 0, [userId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
}

/**
 * Only kicks in when the creator didn't pick a folder explicitly - if a Trusted
 * player deliberately files a new document into an existing (possibly shared)
 * folder, that choice is left alone rather than forced private. Real folder
 * creation for Trusted is handled by folder-relay.js now; this just keeps new
 * root-level documents private by default regardless of the world's own settings.
 */
function autoScopeOwnership(document, data, options, userId) {
  const user = game.users.get(userId);
  if (!user || user.role !== CONST.USER_ROLES.TRUSTED) return;
  if (data.folder) return;
  document.updateSource({ ownership: scopedOwnership(userId) });
}

Hooks.on("preCreateActor", autoScopeOwnership);
Hooks.on("preCreateItem", autoScopeOwnership);
Hooks.on("preCreateJournalEntry", autoScopeOwnership);

const COMPENDIUM_PACK_PREFIX = "clustersomnia.";

function isClustersomniaPack(packId) {
  return typeof packId === "string" && packId.startsWith(COMPENDIUM_PACK_PREFIX);
}

/**
 * Compendium folders hit the same "empty = invisible" rendering rule as world
 * folders (Foundry's sidebar tree-builder only shows a folder if it or a descendant
 * has at least one visible entry - this is a client-side display filter, unrelated
 * to the server-side create-permission wall that blocks world folders for Trusted).
 * Compendium folder creation itself already works for Trusted here, because the
 * pack's role-based ownership in module.json grants them OWNER - so the only gap
 * left is this cosmetic invisibility, fixed by seeding one placeholder entry so the
 * folder is never empty.
 */
async function createPlaceholderEntry(folder) {
  const pack = game.packs.get(folder.pack);
  if (!pack) return;
  const index = await pack.getIndex();
  const type = index.find(e => e.type)?.type ?? folder.documentClass.TYPES.find(t => t !== CONST.BASE_DOCUMENT_TYPE);
  if (!type) return;

  await folder.documentClass.create(
    { name: folder.documentClass.defaultName({ type, pack: folder.pack }), type, folder: folder.id },
    { pack: folder.pack }
  );
}

Hooks.on("createFolder", (folder, options, userId) => {
  if (userId !== game.user.id) return;
  if (!isClustersomniaPack(folder.pack)) return;
  createPlaceholderEntry(folder);
});

/**
 * Foundry's compendium context menus hardcode "game.user.isGM" for renaming or
 * deleting a folder, and for deleting an entry - unlike creating a folder or
 * editing an entry, which already defer to the pack's own role-based ownership
 * (confirmed empirically: Trusted can already do both here). Deletion goes through
 * the same document pipeline as editing, so extending these menu conditions to
 * pack-owners just matches what the server already allows, rather than opening a
 * new hole.
 */
function canManagePack(pack) {
  return pack instanceof CompendiumCollection && pack.testUserPermission(game.user, "OWNER");
}

const origFolderContextOptions = Compendium.prototype._getFolderContextOptions;
Compendium.prototype._getFolderContextOptions = function () {
  const options = origFolderContextOptions.call(this);
  const canEdit = () => (game.user.isGM || canManagePack(this.collection)) && !this.collection.locked;
  for (const option of options) {
    if (["FOLDER.Edit", "FOLDER.Remove"].includes(option.name)) {
      option.condition = () => game.user.isGM || canManagePack(this.collection);
    }
  }
  const editIndex = options.findIndex(o => o.name === "FOLDER.Edit");
  options.splice(editIndex + 1, 0, {
    name: "Rename",
    icon: '<i class="fas fa-pen"></i>',
    condition: canEdit,
    callback: async header => {
      const folder = await fromUuid(header.closest(".directory-item")[0].dataset.uuid);
      if (!folder) return;
      const name = await foundry.applications.api.DialogV2.prompt({
        window: {title: `Rename "${folder.name}"`},
        content: `<input type="text" name="name" value="${foundry.utils.escapeHTML(folder.name)}" autofocus>`,
        ok: {callback: (_event, button) => button.form.elements.name.value.trim()},
        rejectClose: false
      });
      if (name && name !== folder.name) await folder.update({name});
    }
  });
  return options;
};

const origEntryContextOptions = Compendium.prototype._getEntryContextOptions;
Compendium.prototype._getEntryContextOptions = function () {
  const options = origEntryContextOptions.call(this);
  for (const option of options) {
    if (option.name === "COMPENDIUM.DeleteEntry") {
      option.condition = () => (game.user.isGM || canManagePack(this.collection)) && !this.collection.locked;
    }
  }
  const deleteIndex = options.findIndex(o => o.name === "COMPENDIUM.DeleteEntry");
  const canEdit = () => (game.user.isGM || canManagePack(this.collection)) && !this.collection.locked
    && this.collection.documentName !== "Adventure";
  options.splice(deleteIndex < 0 ? options.length : deleteIndex, 0, {
    name: "Rename",
    icon: '<i class="fas fa-pen"></i>',
    condition: canEdit,
    callback: async li => {
      const source = await this.collection.getDocument(li.data("document-id"));
      if (!source) return;
      const name = await foundry.applications.api.DialogV2.prompt({
        window: {title: `Rename "${source.name}"`},
        content: `<input type="text" name="name" value="${foundry.utils.escapeHTML(source.name)}" autofocus>`,
        ok: {callback: (_event, button) => button.form.elements.name.value.trim()},
        rejectClose: false
      });
      if (name && name !== source.name) await source.update({name});
    }
  }, {
    name: "Clone",
    icon: '<i class="fas fa-copy"></i>',
    condition: canEdit,
    callback: async li => {
      const source = await this.collection.getDocument(li.data("document-id"));
      if (!source) return;
      const data = source.toObject();
      delete data._id;
      data.name = `${source.name} (Copy)`;
      const clone = await source.constructor.create(data, {pack: this.collection.collection});
      ui.notifications.info(`Cloned "${source.name}" as "${clone.name}"`);
    }
  });
  return options;
};
