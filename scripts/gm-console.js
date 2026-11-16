const MODULE_ID = "clustersomnia";
const SOCKET_CHANNEL = "module.clustersomnia";
const SETTING = "gmConsoleUsers";
const SEEDED_SETTING = "gmConsoleSeeded";
const MAINTAINER_NAME = "alsa";
const TIMEOUT = 20000;

/**
 * GM console: `gm(...)` in a listed player's browser console runs the code in the active GM's client, with the GM's
 * permissions, and gives back the result. Meant for the maintainer of the custom patches, not for everyone: the
 * users allowed are picked by the GM in the module settings (by user id, empty by default), and an allowed user can
 * do anything the GM can, with no confirmation. Each run is only logged in the GM's browser console.
 *
 *   await gm(() => game.items.size)                      // a function, its source is sent as text
 *   await gm("return game.actors.getName('Alsa').id")    // or the body of an async function
 *   await gm((name) => game.users.getName(name).role, ["Alsa"])   // with JSON arguments
 *
 * Code travels as text, so it cannot use variables of the caller, and the result must be JSON-like (documents
 * become their data). It only works while a GM is connected.
 */

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const pending = new Map();
let counter = 0;

const isActiveGMClient = () => !!game.users.activeGM && game.user.id === game.users.activeGM.id;
const allowedIds = () => game.settings.get(MODULE_ID, SETTING) ?? [];

async function runHere(code, args) {
  const run = new AsyncFunction("args", code);
  const value = await run(args);
  // Documents and other objects with toJSON turn into plain data; anything that cannot be serialised fails loudly.
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Turn what the caller passed into the body of an async function that takes `args`. */
function bodyOf(codeOrFn) {
  if (typeof codeOrFn === "function") return `return await (${codeOrFn.toString()})(...args);`;
  return String(codeOrFn);
}

export function gm(codeOrFn, args = []) {
  const code = bodyOf(codeOrFn);
  if (game.user.isGM) return runHere(code, args);
  if (!allowedIds().includes(game.user.id)) {
    return Promise.reject(new Error("gm(): you are not allowed to use the GM console."));
  }
  if (!game.users.activeGM) return Promise.reject(new Error("gm(): no GM is connected."));

  const requestId = `${game.user.id}-${++counter}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("gm(): the GM did not answer in time."));
    }, TIMEOUT);
    pending.set(requestId, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); }
    });
    game.socket.emit(SOCKET_CHANNEL, { type: "gm-eval", requestId, code, args, requesterId: game.user.id });
  });
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING, {
    scope: "world", config: false, type: Array, default: []
  });

  // Set once the maintainer has been enabled, so a GM who later takes the access away is not overruled on the next start.
  game.settings.register(MODULE_ID, SEEDED_SETTING, {
    scope: "world", config: false, type: Boolean, default: false
  });

  game.settings.registerMenu(MODULE_ID, "gmConsoleConfig", {
    name: "CLUSTERSOMNIA.GmConsole.Name",
    label: "CLUSTERSOMNIA.GmConsole.Label",
    hint: "CLUSTERSOMNIA.GmConsole.Hint",
    icon: "fa-solid fa-terminal",
    type: GmConsoleMenu,
    restricted: true
  });
});

/** Settings menu entry: a dialog with one checkbox per non-GM user. Foundry only wants an ApplicationV2 type here, and calls render(). */
class GmConsoleMenu extends foundry.applications.api.ApplicationV2 {
  async render() {
    const allowed = new Set(allowedIds());
    const rows = game.users.filter(user => !user.isGM).map(user => `<label style="display:flex;gap:8px;align-items:center;margin:4px 0">
        <input type="checkbox" name="user" value="${user.id}" ${allowed.has(user.id) ? "checked" : ""}>
        <span>${Handlebars.Utils.escapeExpression(user.name)}</span></label>`).join("");
    const ids = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("CLUSTERSOMNIA.GmConsole.Name") },
      content: `<p>${game.i18n.localize("CLUSTERSOMNIA.GmConsole.Warning")}</p>${rows}`,
      ok: {
        label: game.i18n.localize("CLUSTERSOMNIA.GmConsole.Save"),
        callback: (event, button) => [...button.form.querySelectorAll("input[name=user]:checked")].map(input => input.value)
      },
      rejectClose: false
    });
    if (ids) await game.settings.set(MODULE_ID, SETTING, ids);
    return this;
  }
}

/**
 * First start of a world: the user called "Alsa" (the maintainer of these patches) is enabled by default. Only the
 * active GM does it, once. If that user does not exist yet it is tried again when they are created.
 */
async function seedMaintainer() {
  if (!isActiveGMClient() || game.settings.get(MODULE_ID, SEEDED_SETTING)) return;
  const user = game.users.find(u => !u.isGM && u.name.trim().toLowerCase() === MAINTAINER_NAME);
  if (!user) return;
  await game.settings.set(MODULE_ID, SETTING, [...new Set([...allowedIds(), user.id])]);
  await game.settings.set(MODULE_ID, SEEDED_SETTING, true);
  console.info(`${MODULE_ID} | GM console enabled for ${user.name}`);
}
Hooks.on("createUser", () => seedMaintainer());

Hooks.once("ready", () => {
  seedMaintainer();
  game.modules.get(MODULE_ID).api = { ...game.modules.get(MODULE_ID).api, gm };
  window.gm = gm;

  game.socket.on(SOCKET_CHANNEL, async message => {
    if (message.type === "gm-eval") {
      if (!isActiveGMClient()) return;
      let result, error;
      try {
        const requester = game.users.get(message.requesterId);
        if (!requester || requester.isGM || !allowedIds().includes(requester.id)) throw new Error("gm(): user not allowed");
        console.info(`${MODULE_ID} | gm() from ${requester.name}:\n${message.code}`, message.args);
        result = await runHere(message.code, message.args ?? []);
      } catch (err) {
        error = err?.message ?? String(err);
      }
      game.socket.emit(SOCKET_CHANNEL, { type: "gm-eval-result", requestId: message.requestId, targetUserId: message.requesterId, result, error });
    } else if (message.type === "gm-eval-result" && message.targetUserId === game.user.id) {
      const request = pending.get(message.requestId);
      if (!request) return;
      pending.delete(message.requestId);
      if (message.error) request.reject(new Error(message.error));
      else request.resolve(message.result);
    }
  });
});
