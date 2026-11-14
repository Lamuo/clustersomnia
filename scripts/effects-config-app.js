import { persistenceActor, effectKey } from "./persistence.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const FLAG_NAMESPACE = "clustersomnia";

export class EffectsConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  static DEFAULT_OPTIONS = {
    id: "sotdl-effects-config-{id}",
    tag: "div",
    classes: ["sotdl-effects-config-app"],
    window: {
      title: "CLUSTERSOMNIA.EffectsConfigTitle",
      icon: "fas fa-gear",
      resizable: true
    },
    position: {
      width: 270,
      height: 600
    },
    actions: {
      save: EffectsConfigApp.#onSave,
      cancel: EffectsConfigApp.#onCancel
    }
  };

  static PARTS = {
    body: {
      template: "modules/clustersomnia/templates/effects-config.hbs"
    }
  };

  get title() {
    return `${game.i18n.localize("CLUSTERSOMNIA.EffectsConfigTitle")} — ${this.actor.name}`;
  }

  async _prepareContext(_options) {
    const displayed = new Set(persistenceActor(this.actor).getFlag(FLAG_NAMESPACE, "displayedEffectIds") ?? []);
    const effects = Array.from(this.actor.allApplicableEffects()).map((effect) => ({
      key: effectKey(effect),
      img: effect.img,
      name: effect.name,
      checked: displayed.has(effectKey(effect)) || displayed.has(effect.uuid)
    }));
    return { effects };
  }

  static async #onSave(_event, _target) {
    const checked = Array.from(
      this.element.querySelectorAll('input[name="effect"]:checked')
    ).map((el) => el.value);
    await persistenceActor(this.actor).setFlag(FLAG_NAMESPACE, "displayedEffectIds", checked);
    this.close();
  }

  static #onCancel(_event, _target) {
    this.close();
  }
}
