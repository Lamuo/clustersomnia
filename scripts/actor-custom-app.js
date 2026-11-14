import { TrackerApp } from "./tracker-app.js";
import { persistenceActor } from "./persistence.js";
import { refreshTokenSpecializations } from "./token-specializations.js";
import { refreshPartyCards } from "./union-meter.js";
import {
  DEFAULT_LIBRARY, SPECIALIZATIONS_FLAG, SPECIALIZATION_LIBRARY_SETTING,
  allSpecializations, libraryOf, numberToCss, specializationsOf, stepManualTag
} from "./tags.js";

const MODULE_ID = "clustersomnia";

/**
 * The actor's panel, two tabs: the Tracker (HP, counters, effects; first) and Custom (specializations, signature
 * emblem, manual tags). Opened from a button in the title bar of any actor sheet (monsters included) and from the
 * Token HUD. It extends TrackerApp, so the Tracker tab's actions, hooks and handlers are inherited untouched.
 * Everything is stored on the world actor (`persistenceActor`), so the choices are shared by all the tokens of a
 * monster and survive an unlinked token being deleted.
 */
export class ActorCustomApp extends TrackerApp {
  constructor(actor, options = {}) {
    super(actor, { id: ActorCustomApp.idFor(actor), ...options });
    this._tab = "tracker";
  }

  static idFor(actor) {
    return `clustersomnia-custom-${persistenceActor(actor).uuid.replaceAll(".", "-")}`;
  }

  /** Opens the panel for an actor, or brings it to the front when it is already up. */
  static open(actor) {
    const open = foundry.applications.instances.get(ActorCustomApp.idFor(actor));
    if (open) open.bringToFront();
    else new ActorCustomApp(actor).render(true);
  }

  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["clustersomnia-custom-app"],
    window: { title: "CLUSTERSOMNIA.Tracker", icon: "fas fa-wand-magic-sparkles", resizable: true },
    position: { width: 400, height: "auto" },
    actions: {
      switchTab: ActorCustomApp.#onSwitchTab,
      toggleSpec: ActorCustomApp.#onToggleSpec,
      libraryAdd: ActorCustomApp.#onLibraryAdd,
      libraryEdit: ActorCustomApp.#onLibraryEdit,
      libraryRemove: ActorCustomApp.#onLibraryRemove,
      tagStep: ActorCustomApp.#onTagStep,
      signatureImage: ActorCustomApp.#onSignatureImage,
      signatureClear: ActorCustomApp.#onSignatureClear
    }
  };

  static PARTS = {
    nav: { template: "modules/clustersomnia/templates/actor-panel-nav.hbs" },
    tracker: { template: "modules/clustersomnia/templates/tracker.hbs" },
    custom: { template: "modules/clustersomnia/templates/actor-custom.hbs" }
  };

  get title() {
    return this.actor.name;
  }

  get base() {
    return persistenceActor(this.actor);
  }

  async _prepareContext(options) {
    const tracker = await super._prepareContext(options);
    const chosen = new Set(specializationsOf(this.actor, { auto: false }).map(entry => entry.id));
    const signature = this.base.getFlag(MODULE_ID, "signature") ?? {};
    const describe = entry => ({
      ...entry,
      css: numberToCss(entry.color),
      title: entry.effect ? `${entry.name}: ${entry.effect}` : `${entry.name}${entry.stat ? ` (${entry.stat})` : ""}`,
      on: chosen.has(entry.id)
    });
    // `tags` and the rest of the Tracker's context come from super (the Tag section shows on one tab only).
    return {
      ...tracker,
      isGM: game.user.isGM,
      specializations: allSpecializations().map(describe),
      library: libraryOf().map(describe),
      signature: { name: signature.name ?? "", icon: signature.icon ?? "", image: signature.image ?? "" }
    };
  }

  _onRender(context, options) {
    // The Tracker's hooks and handlers, including the right click on the tag buttons (shared by both tabs).
    super._onRender(context, options);

    // The text fields are saved when they lose focus.
    for (const input of this.element.querySelectorAll("[data-signature-field]")) {
      input.addEventListener("change", () => this.#saveSignature({ [input.dataset.signatureField]: input.value.trim() }));
    }
    this.#showTab();
  }

  #showTab() {
    for (const el of this.element.querySelectorAll("[data-tab]")) el.hidden = el.dataset.tab !== this._tab;
    for (const el of this.element.querySelectorAll("[data-tab-target]")) {
      el.classList.toggle("active", el.dataset.tabTarget === this._tab);
    }
    this.setPosition({ height: "auto" });
  }

  static #onSwitchTab(_event, target) {
    this._tab = target.dataset.tabTarget;
    this.#showTab();
  }

  // The whole object is replaced ("==") so a cleared field really goes away instead of being merged back.
  async #saveSignature(patch) {
    const next = { ...(this.base.getFlag(MODULE_ID, "signature") ?? {}), ...patch };
    for (const key of Object.keys(next)) if (!next[key]) delete next[key];
    if (Object.keys(next).length) await this.base.update({ [`flags.${MODULE_ID}.==signature`]: next });
    else await this.base.update({ [`flags.${MODULE_ID}.-=signature`]: null });
  }

  static async #onToggleSpec(_event, target) {
    const id = target.dataset.id;
    const current = new Set(specializationsOf(this.actor, { auto: false }).map(entry => entry.id));
    if (current.has(id)) current.delete(id);
    else current.add(id);
    // An empty list stays a list: the flag being there means "assigned by hand", so no automatic one comes back.
    await this.base.setFlag(MODULE_ID, SPECIALIZATIONS_FLAG, allSpecializations().map(e => e.id).filter(i => current.has(i)));
  }

  // --- The library (world setting, GM only) ---

  static async #onLibraryAdd(_event, _target) {
    const entry = await askEntry({ name: "", short: "", icon: "fa-solid fa-star", color: "#cccccc", effect: "" }, game.i18n.localize("CLUSTERSOMNIA.NewSpec"));
    if (!entry) return;
    const list = readLibrary();
    // The id is made from the name once and never changes, because actors store it.
    let id = slug(entry.name) || foundry.utils.randomID(6);
    while (list.some(e => e.id === id) || ["strength", "agility", "intellect", "will"].includes(id)) id += "-";
    await saveLibrary([...list, { id, ...entry }]);
  }

  static async #onLibraryEdit(_event, target) {
    const list = readLibrary();
    const found = list.find(e => e.id === target.dataset.id);
    if (!found) return;
    const entry = await askEntry(found, game.i18n.format("CLUSTERSOMNIA.EditSpec", { name: found.name }));
    if (entry) await saveLibrary(list.map(e => (e.id === found.id ? { ...found, ...entry } : e)));
  }

  static async #onLibraryRemove(_event, target) {
    const list = readLibrary();
    const found = list.find(e => e.id === target.dataset.id);
    if (!found) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("CLUSTERSOMNIA.DeleteSpecTitle") },
      content: `<p>${game.i18n.format("CLUSTERSOMNIA.DeleteSpecConfirm", { name: Handlebars.Utils.escapeExpression(found.name) })}</p>`,
      rejectClose: false
    });
    if (ok) await saveLibrary(list.filter(e => e.id !== found.id));
  }

  static #onTagStep(event, target) {
    // A right click is handled by its own listener (see _onRender); only the left one is this action.
    if (event.type !== "click") return;
    return stepManualTag(this.actor, target.dataset.tagId, 1);
  }

  static #onSignatureImage(_event, _target) {
    new FilePicker({
      type: "image",
      current: this.base.getFlag(MODULE_ID, "signature")?.image ?? "",
      callback: path => this.#saveSignature({ image: path })
    }).render(true);
  }

  static #onSignatureClear(_event, _target) {
    return this.base.update({ [`flags.${MODULE_ID}.-=signature`]: null });
  }

}

const slug = text => String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The library as saved, colours still as CSS strings (what gets written back). */
function readLibrary() {
  const saved = game.settings.get(MODULE_ID, SPECIALIZATION_LIBRARY_SETTING);
  return foundry.utils.deepClone(Array.isArray(saved) ? saved : DEFAULT_LIBRARY);
}

async function saveLibrary(list) {
  await game.settings.set(MODULE_ID, SPECIALIZATION_LIBRARY_SETTING, list);
}

const t = key => game.i18n.localize(`CLUSTERSOMNIA.${key}`);

/** A small form for one library entry; resolves to its fields, or null when cancelled. */
async function askEntry(entry, title) {
  const esc = Handlebars.Utils.escapeExpression;
  const content = `
    <div class="clustersomnia-spec-form">
      <label>${t("SpecFormName")} <input type="text" name="name" value="${esc(entry.name)}" required></label>
      <label>${t("SpecFormShort")} <input type="text" name="short" value="${esc(entry.short)}" maxlength="4"></label>
      <label>${t("SpecFormIcon")} <input type="text" name="icon" value="${esc(entry.icon)}" placeholder="fa-solid fa-dove"></label>
      <label>${t("SpecFormColor")} <input type="color" name="color" value="${esc(entry.color)}"></label>
      <label>${t("SpecFormEffect")} <textarea name="effect" rows="3">${esc(entry.effect)}</textarea></label>
    </div>`;
  const data = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content,
    rejectClose: false,
    ok: { label: t("Save"), callback: (_event, button) => new FormDataExtended(button.form).object }
  });
  if (!data?.name?.trim()) return null;
  return {
    name: data.name.trim(),
    short: (data.short?.trim() || data.name.trim().slice(0, 3)),
    icon: data.icon?.trim() || "fa-solid fa-star",
    color: data.color || "#cccccc",
    effect: data.effect?.trim() ?? ""
  };
}

// The library lives in a world setting; when it changes, everything that draws specializations redraws.
Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SPECIALIZATION_LIBRARY_SETTING, {
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_LIBRARY,
    onChange: () => {
      refreshTokenSpecializations();
      refreshPartyCards();
      for (const app of foundry.applications.instances.values()) if (app instanceof ActorCustomApp) app.render();
    }
  });
});

// A button in the title bar of every actor sheet, like Alsa's: it opens the panel.
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  if (!sheet.actor?.isOwner) return;
  buttons.unshift({
    label: "",
    // Not "clustersomnia-custom": that class styles the panel's own content (tracker.css) and would lay the button out as a column.
    class: "clustersomnia-custom-button",
    icon: "fas fa-wand-magic-sparkles",
    onclick: () => ActorCustomApp.open(sheet.actor)
  });
});

// Header buttons have no tooltip of their own.
Hooks.on("renderActorSheet", (sheet, html) => {
  const button = (html[0] ?? html).querySelector?.(".clustersomnia-custom-button");
  if (button) button.title = game.i18n.localize("CLUSTERSOMNIA.TrackerTooltip");
});

// The same panel from the Token HUD.
Hooks.on("renderTokenHUD", (hud, html) => {
  const actor = hud.object?.actor;
  if (!actor?.isOwner) return;
  const root = html instanceof HTMLElement ? html : html[0];
  const button = document.createElement("div");
  button.classList.add("control-icon", "clustersomnia-custom-hud-button");
  button.dataset.tooltip = game.i18n.localize("CLUSTERSOMNIA.Tracker");
  button.innerHTML = `<i class="fas fa-wand-magic-sparkles"></i>`;
  button.addEventListener("click", () => ActorCustomApp.open(actor));
  (root.querySelector(".col.right") ?? root.querySelector(".col.left"))?.appendChild(button);
});
