import { EffectsConfigApp } from "./effects-config-app.js";
import { TrackerApp } from "./tracker-app.js";
import { persistenceActor } from "./persistence.js";
import { refreshTokenSpecializations } from "./token-specializations.js";
import { refreshPartyCards } from "./union-meter.js";
import {
  DEFAULT_LIBRARY, SPECIALIZATIONS_FLAG, SPECIALIZATION_LIBRARY_SETTING, TAG_CATEGORIES,
  allSpecializations, libraryOf, manualTags, numberToCss, specializationsOf, stepManualTag, tagDisplay
} from "./tags.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODULE_ID = "clustersomnia";

/**
 * One compact panel with everything custom an actor carries: specializations, signature emblem, manual tags, and
 * doors to the counters (Tracker) and the displayed effects. Opened from a button in the title bar of any actor sheet
 * (monsters included) and from the Token HUD. Everything is stored on the world actor (`persistenceActor`), so the
 * choices are shared by all the tokens of a monster and survive an unlinked token being deleted.
 */
export class ActorCustomApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super({ id: ActorCustomApp.idFor(actor), ...options });
    this.actor = actor;
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
    window: { title: "Custom", icon: "fas fa-wand-magic-sparkles", resizable: true },
    position: { width: 340, height: "auto" },
    actions: {
      toggleSpec: ActorCustomApp.#onToggleSpec,
      libraryAdd: ActorCustomApp.#onLibraryAdd,
      libraryEdit: ActorCustomApp.#onLibraryEdit,
      libraryRemove: ActorCustomApp.#onLibraryRemove,
      tagStep: ActorCustomApp.#onTagStep,
      signatureImage: ActorCustomApp.#onSignatureImage,
      signatureClear: ActorCustomApp.#onSignatureClear,
      openTracker: ActorCustomApp.#onOpenTracker,
      openEffects: ActorCustomApp.#onOpenEffects
    }
  };

  static PARTS = {
    body: { template: "modules/clustersomnia/templates/actor-custom.hbs" }
  };

  get title() {
    return `Custom — ${this.actor.name}`;
  }

  get base() {
    return persistenceActor(this.actor);
  }

  async _prepareContext(_options) {
    const chosen = new Set(specializationsOf(this.actor, { auto: false }).map(entry => entry.id));
    const manual = manualTags(this.actor);
    const signature = this.base.getFlag(MODULE_ID, "signature") ?? {};
    const describe = entry => ({
      ...entry,
      css: numberToCss(entry.color),
      title: entry.effect ? `${entry.name}: ${entry.effect}` : `${entry.name}${entry.stat ? ` (${entry.stat})` : ""}`,
      on: chosen.has(entry.id)
    });
    return {
      isGM: game.user.isGM,
      specializations: allSpecializations().map(describe),
      library: libraryOf().map(describe),
      tags: TAG_CATEGORIES.map(category => ({
        id: category.id, label: category.label, name: category.name, ...tagDisplay(manual[category.id] ?? 0)
      })),
      signature: { name: signature.name ?? "", icon: signature.icon ?? "", image: signature.image ?? "" },
      counters: (this.base.getFlag(MODULE_ID, "counters") ?? []).length
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Hooks are registered once per window and removed in _onClose (same pattern as the Tracker).
    this._hooks ??= [
      ["updateActor", Hooks.on("updateActor", actor => {
        if (actor.id === this.actor.id || actor.id === this.base.id) this.render();
      })]
    ];

    // The text fields are saved when they lose focus.
    for (const input of this.element.querySelectorAll("[data-signature-field]")) {
      input.addEventListener("change", () => this.#saveSignature({ [input.dataset.signatureField]: input.value.trim() }));
    }
    for (const button of this.element.querySelectorAll(".sotdl-tag-button")) {
      button.addEventListener("contextmenu", event => {
        event.preventDefault();
        stepManualTag(this.actor, button.dataset.tagId, -1);
      });
    }
  }

  _onClose(options) {
    super._onClose(options);
    for (const [name, id] of this._hooks ?? []) Hooks.off(name, id);
    this._hooks = null;
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
    const entry = await askEntry({ name: "", short: "", icon: "fa-solid fa-star", color: "#cccccc", effect: "" }, "Nuova specializzazione");
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
    const entry = await askEntry(found, `Modifica ${found.name}`);
    if (entry) await saveLibrary(list.map(e => (e.id === found.id ? { ...found, ...entry } : e)));
  }

  static async #onLibraryRemove(_event, target) {
    const list = readLibrary();
    const found = list.find(e => e.id === target.dataset.id);
    if (!found) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Elimina specializzazione" },
      content: `<p>Eliminare <strong>${Handlebars.Utils.escapeExpression(found.name)}</strong> dalla libreria? Sparisce da tutti gli actor che la hanno.</p>`,
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

  static #onOpenTracker(_event, _target) {
    new TrackerApp(this.actor).render(true);
  }

  static #onOpenEffects(_event, _target) {
    new EffectsConfigApp(this.actor).render(true);
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

/** A small form for one library entry; resolves to its fields, or null when cancelled. */
async function askEntry(entry, title) {
  const esc = Handlebars.Utils.escapeExpression;
  const content = `
    <div class="clustersomnia-spec-form">
      <label>Nome <input type="text" name="name" value="${esc(entry.name)}" required></label>
      <label>Sigla (3 lettere, sulle card) <input type="text" name="short" value="${esc(entry.short)}" maxlength="4"></label>
      <label>Icona FontAwesome <input type="text" name="icon" value="${esc(entry.icon)}" placeholder="fa-solid fa-dove"></label>
      <label>Colore <input type="color" name="color" value="${esc(entry.color)}"></label>
      <label>Effetto (appare al passaggio del mouse) <textarea name="effect" rows="3">${esc(entry.effect)}</textarea></label>
    </div>`;
  const data = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content,
    rejectClose: false,
    ok: { label: "Salva", callback: (_event, button) => new FormDataExtended(button.form).object }
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
    class: "clustersomnia-custom",
    icon: "fas fa-wand-magic-sparkles",
    onclick: () => ActorCustomApp.open(sheet.actor)
  });
});

// Header buttons have no tooltip of their own.
Hooks.on("renderActorSheet", (sheet, html) => {
  const button = (html[0] ?? html).querySelector?.(".clustersomnia-custom");
  if (button) button.title = "Custom: specializzazioni, firma, tag";
});

// The same panel from the Token HUD.
Hooks.on("renderTokenHUD", (hud, html) => {
  const actor = hud.object?.actor;
  if (!actor?.isOwner) return;
  const root = html instanceof HTMLElement ? html : html[0];
  const button = document.createElement("div");
  button.classList.add("control-icon", "clustersomnia-custom-hud-button");
  button.dataset.tooltip = "Custom";
  button.innerHTML = `<i class="fas fa-wand-magic-sparkles"></i>`;
  button.addEventListener("click", () => ActorCustomApp.open(actor));
  (root.querySelector(".col.right") ?? root.querySelector(".col.left"))?.appendChild(button);
});
