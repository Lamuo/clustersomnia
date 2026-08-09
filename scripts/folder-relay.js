const FLAG_NAMESPACE = "clustersomnia";
const CREATED_BY_FLAG = "createdBy";
const SOCKET_CHANNEL = "module.clustersomnia";

function canRelay(user) {
  return user?.role === CONST.USER_ROLES.TRUSTED;
}

/* -------------------------------------------- */
/*  Relay engine - no socketlib dependency:      */
/*  native game.socket, one module-scoped        */
/*  channel, request/response matched by id.     */
/* -------------------------------------------- */

const pendingRequests = new Map();
let requestCounter = 0;

function isActiveGMClient() {
  return !!game.users.activeGM && game.user.id === game.users.activeGM.id;
}

/**
 * World folders have the same "empty = invisible" sidebar rule as compendium
 * folders (see folder-permissions.js) - without at least one visible entry, not
 * even the creator sees their own new folder. Seed one placeholder, scoped to
 * them + GM, so it's never empty.
 */
async function seedPlaceholder(folder, requesterId) {
  const cls = folder.documentClass;
  const types = cls.TYPES?.filter(t => t !== CONST.BASE_DOCUMENT_TYPE) ?? [];
  const subtype = types.length ? (CONFIG[folder.type]?.defaultType ?? types[0]) : undefined;

  const data = {
    name: cls.defaultName({ type: subtype }),
    folder: folder.id,
    ownership: { default: 0, [requesterId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
  };
  if (subtype) data.type = subtype;
  await cls.create(data);
}

const EXECUTORS = {
  async createFolder({ type, data }, requesterId) {
    const folder = await Folder.create({ ...data, type });
    await folder.setFlag(FLAG_NAMESPACE, CREATED_BY_FLAG, requesterId);
    await seedPlaceholder(folder, requesterId);
    return folder.toObject();
  },
  async updateFolder({ folderId, changes }, requesterId) {
    const folder = game.folders.get(folderId);
    if (!folder) throw new Error("Cartella non trovata");
    if (folder.getFlag(FLAG_NAMESPACE, CREATED_BY_FLAG) !== requesterId) throw new Error("Non è una tua cartella");
    await folder.update(changes);
    return folder.toObject();
  },
  async deleteFolder({ folderId, deleteSubfolders, deleteContents }, requesterId) {
    const folder = game.folders.get(folderId);
    if (!folder) return true;
    if (folder.getFlag(FLAG_NAMESPACE, CREATED_BY_FLAG) !== requesterId) throw new Error("Non è una tua cartella");
    await folder.delete({ deleteSubfolders, deleteContents });
    return true;
  },
  async deleteEntry({ documentType, documentId }, requesterId) {
    const document = game.collections.get(documentType)?.get(documentId);
    if (!document) return true;
    const requester = game.users.get(requesterId);
    if (!document.testUserPermission(requester, "OWNER")) throw new Error("Non sei owner di questo documento");
    await document.delete();
    return true;
  }
};

Hooks.once("ready", () => {
  game.socket.on(SOCKET_CHANNEL, async message => {
    if (message.type === "request") {
      if (!isActiveGMClient()) return;
      let result, error;
      try {
        const requester = game.users.get(message.requesterId);
        if (!canRelay(requester)) throw new Error("Richiedente non Trusted");
        result = await EXECUTORS[message.action](message.payload, message.requesterId);
      } catch (err) {
        error = err.message ?? String(err);
      }
      game.socket.emit(SOCKET_CHANNEL, {
        type: "response", requestId: message.requestId, targetUserId: message.requesterId, result, error
      });
    } else if (message.type === "response" && message.targetUserId === game.user.id) {
      const request = pendingRequests.get(message.requestId);
      if (!request) return;
      pendingRequests.delete(message.requestId);
      if (message.error) request.reject(new Error(message.error));
      else request.resolve(message.result);
    }
  });
});

function requestFromGM(action, payload, { timeout = 8000 } = {}) {
  if (game.user.isGM) return EXECUTORS[action](payload, game.user.id);
  if (!game.users.activeGM) {
    const err = new Error("Nessun GM connesso: operazione annullata.");
    ui.notifications.warn(`${FLAG_NAMESPACE} | ${err.message}`);
    return Promise.reject(err);
  }

  const requestId = `${game.user.id}-${++requestCounter}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("Timeout: il GM non ha risposto in tempo"));
    }, timeout);
    pendingRequests.set(requestId, {
      resolve: v => { clearTimeout(timer); resolve(v); },
      reject: e => { clearTimeout(timer); reject(e); }
    });
    game.socket.emit(SOCKET_CHANNEL, { type: "request", requestId, action, payload, requesterId: game.user.id });
  });
}

/* -------------------------------------------- */
/*  UI wiring - reuse Foundry's own dialogs and   */
/*  context menus, only swap the final           */
/*  create/update/delete call for Trusted users. */
/* -------------------------------------------- */

/**
 * World Folder documents have no ownership field (see folder-permissions.js), so by
 * default only isGM users can even open the naming/rename dialog. Grant access here
 * only for: a transient (unsaved) folder about to go through the relay, or an
 * existing folder this specific Trusted user created via the relay. Compendium
 * folders are untouched (this.pack set) - they already work via pack ownership.
 */
const origFolderTestUserPermission = Folder.prototype.testUserPermission;
Folder.prototype.testUserPermission = function (user, permission, options) {
  if (!this.pack && canRelay(user)) {
    if (!this.id) return true;
    if (this.getFlag(FLAG_NAMESPACE, CREATED_BY_FLAG) === user.id) return true;
  }
  return origFolderTestUserPermission.call(this, user, permission, options);
};

const origFolderConfigUpdateObject = FolderConfig.prototype._updateObject;
FolderConfig.prototype._updateObject = async function (event, formData) {
  const folder = this.object;
  if (folder.pack || !canRelay(game.user)) return origFolderConfigUpdateObject.call(this, event, formData);

  if (!formData.name?.trim()) formData.name = Folder.implementation.defaultName({ pack: folder.pack });
  try {
    let doc;
    if (folder.id) {
      await requestFromGM("updateFolder", { folderId: folder.id, changes: formData });
      doc = folder;
    } else {
      const created = await requestFromGM("createFolder", {
        type: folder.type,
        data: { ...folder.toObject(), ...formData }
      });
      doc = (await fromUuid(`Folder.${created._id}`)) ?? created;
    }
    this.options.resolve?.(doc);
    return doc;
  } catch (err) {
    ui.notifications.error(`${FLAG_NAMESPACE} | ${err.message}`);
  }
};

const origWorldFolderContextOptions = DocumentDirectory.prototype._getFolderContextOptions;
DocumentDirectory.prototype._getFolderContextOptions = function () {
  const options = origWorldFolderContextOptions.call(this);
  if (this.collection instanceof CompendiumCollection) return options;

  for (const option of options) {
    if (option.name === "FOLDER.Edit") {
      option.condition = header => canManageFolder(header);
    }
    if (option.name === "FOLDER.Remove") {
      option.condition = header => canManageFolder(header);
      const originalCallback = option.callback;
      option.callback = async header => {
        if (game.user.isGM) return originalCallback(header);
        const li = header.closest(".directory-item")[0];
        const folder = await fromUuid(li.dataset.uuid);
        return Dialog.confirm({
          title: `${game.i18n.localize("FOLDER.Remove")} ${folder.name}`,
          content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("FOLDER.RemoveWarning")}</p>`,
          yes: () => requestFromGM("deleteFolder", { folderId: folder.id, deleteSubfolders: false, deleteContents: false })
            .catch(err => ui.notifications.error(`${FLAG_NAMESPACE} | ${err.message}`)),
          options: {
            top: Math.min(li.offsetTop, window.innerHeight - 350),
            left: window.innerWidth - 720,
            width: 400
          }
        });
      };
    }
  }
  return options;
};

function canManageFolder(header) {
  if (game.user.isGM) return true;
  if (!canRelay(game.user)) return false;
  const li = header.closest(".directory-item")[0];
  const folder = fromUuidSync(li.dataset.uuid);
  return folder?.getFlag(FLAG_NAMESPACE, CREATED_BY_FLAG) === game.user.id;
}

const origWorldEntryContextOptions = DocumentDirectory.prototype._getEntryContextOptions;
DocumentDirectory.prototype._getEntryContextOptions = function () {
  const options = origWorldEntryContextOptions.call(this);
  if (this.collection instanceof CompendiumCollection) return options;

  for (const option of options) {
    if (option.name !== "SIDEBAR.Delete") continue;
    option.condition = header => {
      if (game.user.isGM) return true;
      if (!canRelay(game.user)) return false;
      const li = header.closest(".directory-item");
      const entry = this.collection.get(li.data("entryId"));
      return entry?.testUserPermission(game.user, "OWNER") ?? false;
    };
    const originalCallback = option.callback;
    option.callback = header => {
      if (game.user.isGM) return originalCallback(header);
      const li = header.closest(".directory-item");
      const entry = this.collection.get(li.data("entryId"));
      if (!entry) return;
      return Dialog.confirm({
        title: game.i18n.format("DOCUMENT.Delete", { type: entry.documentName }),
        content: `<h4>${game.i18n.localize("AreYouSure")}</h4>`,
        yes: () => requestFromGM("deleteEntry", { documentType: this.collection.documentName, documentId: entry.id })
          .catch(err => ui.notifications.error(`${FLAG_NAMESPACE} | ${err.message}`)),
        options: {
          top: Math.min(li[0].offsetTop, window.innerHeight - 350),
          left: window.innerWidth - 720
        }
      });
    };
  }
  return options;
};
