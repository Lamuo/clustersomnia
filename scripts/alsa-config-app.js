import {
  MODULE_ID, GENESIS_DEFAULTS, STYLE_DEFAULTS, GIGANTO_DEFAULTS, ICON_MODES,
  genesisElements, attackStyles, gigantomachiaOptions, genesisActor, genesisIconMode, alsaSetting
} from "./alsa-data.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// The icon the weapon itself has, shown for a style that keeps it.
const WEAPON_ICON = "systems/demonlord/assets/icons/weapons/fist.webp";

/**
 * Where the table edits Alsa's attack flavour: what each Genesis element, each Gigantomachia option and each attack
 * style of the unarmed weapon changes on the card. It is kept in a flag on the PG's actor, so whoever controls the PG can edit it; only
 * the choice of the PG itself is the GM's.
 */
export class AlsaConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "sotdl-genesis-config",
    tag: "div",
    classes: ["sotdl-genesis-config-app"],
    window: {
      title: "Modalità Genesis, Gigantomachia e stili del Pugno",
      icon: "fas fa-wand-sparkles",
      resizable: true
    },
    position: {
      width: 660,
      height: 720
    },
    actions: {
      showPane: AlsaConfigApp.#onShowPane,
      pickIcon: AlsaConfigApp.#onPickIcon,
      resetIcon: AlsaConfigApp.#onResetIcon,
      resetAll: AlsaConfigApp.#onResetAll,
      save: AlsaConfigApp.#onSave,
      cancel: AlsaConfigApp.#onCancel
    }
  };

  static PARTS = {
    body: {
      template: "modules/clustersomnia/templates/alsa-config.hbs"
    }
  };

  async _prepareContext(_options) {
    const current = genesisActor();
    const elements = genesisElements();
    const styles = attackStyles();
    const gigantomachia = gigantomachiaOptions();
    // Icons are edited in place and written only on save. The ids of the elements, styles and options never coincide.
    this.icons = Object.fromEntries([...elements, ...styles, ...gigantomachia].map(entry => [entry.id, entry.icon]));
    return {
      isGM: game.user.isGM,
      actors: game.actors.filter(actor => actor.type === "character").map(actor => ({
        id: actor.id, name: actor.name, selected: actor.id === current?.id
      })),
      effectName: alsaSetting("effectName"),
      iconModes: ICON_MODES.map(mode => ({ ...mode, selected: mode.id === genesisIconMode() })),
      elements,
      gigantomachia,
      gigantoEffect: alsaSetting("gigantoEffect"),
      styles: styles.map(style => ({ ...style, shownIcon: style.icon || WEAPON_ICON })),
      styleWeapon: alsaSetting("styleWeapon"),
      styleBlock: alsaSetting("styleBlock"),
      styleCatWeapon: alsaSetting("styleCatWeapon"),
      styleCatEffect: alsaSetting("styleCatEffect"),
      styleHybridWeapon: alsaSetting("styleHybridWeapon"),
      styleHybridEffect: alsaSetting("styleHybridEffect")
    };
  }

  #setIcon(id, src) {
    this.icons[id] = src;
    this.element.querySelector(`[data-id="${id}"] .gc-icon img`).src = src || WEAPON_ICON;
  }

  static #onShowPane(_event, target) {
    for (const tab of this.element.querySelectorAll(".gc-tab")) tab.classList.toggle("active", tab === target);
    for (const pane of this.element.querySelectorAll(".gc-pane")) pane.classList.toggle("active", pane.dataset.pane === target.dataset.pane);
  }

  static #onPickIcon(_event, target) {
    const id = target.closest("[data-id]").dataset.id;
    new FilePicker({
      type: "image",
      current: this.icons[id],
      callback: path => this.#setIcon(id, path)
    }).browse();
  }

  static #onResetIcon(_event, target) {
    const id = target.closest("[data-id]").dataset.id;
    this.#setIcon(id, [...GENESIS_DEFAULTS, ...STYLE_DEFAULTS, ...GIGANTO_DEFAULTS].find(entry => entry.id === id).icon);
  }

  static async #onResetAll(_event, _target) {
    const ok = await Dialog.confirm({
      title: "Ripristina predefiniti",
      content: "<p>Elementi e stili tornano ai valori predefiniti (nomi, icone, descrizioni) e i campi in alto a quelli di partenza. Continuare?</p>"
    });
    if (!ok) return;
    await genesisActor()?.unsetFlag(MODULE_ID, "alsa");
    // What an earlier version kept in the world settings goes as well, or it would come back.
    if (game.user.isGM) await game.settings.set(MODULE_ID, "genesisConfig", {});
    this.render();
  }

  /** What a card of the window holds, kept only where it differs from the defaults (so a later default still reaches untouched cards). */
  #collect(selector, defaults, fields) {
    const result = {};
    for (const card of this.element.querySelectorAll(selector)) {
      const base = defaults.find(entry => entry.id === card.dataset.id);
      const read = name => card.querySelector(`[name=${name}]`)?.value.trim() ?? "";
      const entry = Object.fromEntries(fields.map(name => [name, read(name)]));
      entry.icon = this.icons[base.id] ?? base.icon;
      if (!entry.label) entry.label = base.label;
      const changed = Object.fromEntries(Object.entries(entry).filter(([key, value]) => value !== base[key]));
      if (Object.keys(changed).length) result[base.id] = changed;
    }
    return result;
  }

  static async #onSave(_event, _target) {
    const read = name => this.element.querySelector(`[name=${name}]`).value;
    // The choice of the PG is world data, so only the GM writes it; the rest goes in the PG's own flag.
    if (game.user.isGM) await game.settings.set(MODULE_ID, "genesisActorId", read("actorId"));
    const actor = game.actors.get(read("actorId")) ?? genesisActor();
    if (!actor) return ui.notifications.warn("Nessun personaggio scelto per la modalità Genesis.");

    const config = {
      elements: this.#collect(".gc-el", GENESIS_DEFAULTS, ["label", "name", "damageType", "description"]),
      styles: this.#collect(".gc-st", STYLE_DEFAULTS, ["label", "name", "description"]),
      gigantomachia: this.#collect(".gc-gi", GIGANTO_DEFAULTS, ["label", "name", "description"]),
      gigantoEffect: read("gigantoEffect").trim() || "Gigantomachia",
      effectName: read("effectName").trim() || "Genesis",
      iconMode: read("iconMode"),
      styleWeapon: read("styleWeapon").trim() || "Pugno",
      styleBlock: read("styleBlock").trim(),
      styleCatWeapon: read("styleCatWeapon").trim() || "Artigli (Gatto)",
      styleCatEffect: read("styleCatEffect").trim() || "Forma Gatto",
      styleHybridWeapon: read("styleHybridWeapon").trim() || "Artigli (Ibrido)",
      styleHybridEffect: read("styleHybridEffect").trim() || "Forma Ibrida"
    };
    // Cleared first, so a card put back to its defaults does not keep the keys it had before.
    await actor.unsetFlag(MODULE_ID, "alsa");
    await actor.setFlag(MODULE_ID, "alsa", config);
    ui.notifications.info("Modalità Genesis, Gigantomachia e stili del Pugno salvati.");
    this.close();
  }

  static #onCancel(_event, _target) {
    this.close();
  }
}
