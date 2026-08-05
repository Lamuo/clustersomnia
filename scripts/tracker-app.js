import { EffectsConfigApp } from "./effects-config-app.js";
import { persistenceActor, effectKey } from "./persistence.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const FLAG_NAMESPACE = "clustersomnia";

export class TrackerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  static DEFAULT_OPTIONS = {
    id: "sotdl-tracker-{id}",
    tag: "div",
    window: {
      title: "SotDL Tracker",
      icon: "fas fa-heartbeat",
      resizable: true
    },
    position: {
      width: 400,
      height: "auto"
    },
    actions: {
      hpDelta: TrackerApp.#onHpDelta,
      counterAdd: TrackerApp.#onCounterAdd,
      counterDelta: TrackerApp.#onCounterDelta,
      counterRemove: TrackerApp.#onCounterRemove,
      effectToggle: TrackerApp.#onEffectToggle,
      effectsConfig: TrackerApp.#onEffectsConfig
    }
  };

  static PARTS = {
    body: {
      template: "modules/clustersomnia/templates/tracker.hbs"
    }
  };

  get title() {
    return `SotDL Tracker — ${this.actor.name}`;
  }

  get counters() {
    return foundry.utils.deepClone(this.actor.getFlag(FLAG_NAMESPACE, "counters") ?? []);
  }

  async _setCounters(counters) {
    await this.actor.setFlag(FLAG_NAMESPACE, "counters", counters);
  }

  get allEffects() {
    return Array.from(this.actor.allApplicableEffects());
  }

  get effects() {
    const displayed = new Set(persistenceActor(this.actor).getFlag(FLAG_NAMESPACE, "displayedEffectIds") ?? []);
    return this.allEffects.filter((effect) => displayed.has(effectKey(effect)) || displayed.has(effect.uuid));
  }

  _isEffectRelevant(effect) {
    return effect.parent?.id === this.actor.id || effect.parent?.actor?.id === this.actor.id;
  }

  async _prepareContext(_options) {
    return {
      actor: this.actor,
      health: this.actor.system.characteristics.health,
      counters: this.counters,
      effects: this.effects
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    this._hooks ??= [
      ["updateActor", Hooks.on("updateActor", (actor) => {
        if (actor.id === this.actor.id || actor.id === persistenceActor(this.actor).id) this.render();
      })],
      ["createActiveEffect", Hooks.on("createActiveEffect", (effect) => {
        if (this._isEffectRelevant(effect)) this.render();
      })],
      ["updateActiveEffect", Hooks.on("updateActiveEffect", (effect) => {
        if (this._isEffectRelevant(effect)) this.render();
      })],
      ["deleteActiveEffect", Hooks.on("deleteActiveEffect", (effect) => {
        if (this._isEffectRelevant(effect)) this.render();
      })],
      ["createItem", Hooks.on("createItem", (item) => {
        if (item.actor?.id === this.actor.id) this.render();
      })],
      ["deleteItem", Hooks.on("deleteItem", (item) => {
        if (item.actor?.id === this.actor.id) this.render();
      })]
    ];

    for (const input of this.element.querySelectorAll(".sotdl-counter-name")) {
      input.addEventListener("change", (event) => this._onCounterFieldChange(event, "name", event.target.value));
    }
    for (const input of this.element.querySelectorAll(".sotdl-counter-max")) {
      input.addEventListener("change", (event) => {
        const raw = event.target.value.trim();
        this._onCounterFieldChange(event, "max", raw === "" ? null : Number(raw));
      });
    }
  }

  _onClose(options) {
    super._onClose(options);
    for (const [hookName, hookId] of this._hooks ?? []) {
      Hooks.off(hookName, hookId);
    }
    this._hooks = null;
  }

  _onCounterFieldChange(event, field, value) {
    const id = event.target.closest("[data-counter-row]")?.dataset.counterId;
    const counters = this.counters;
    const counter = counters.find((c) => c.id === id);
    if (!counter) return;
    counter[field] = value;
    if (field === "max" && counter.max !== null && counter.value > counter.max) {
      counter.value = counter.max;
    }
    this._setCounters(counters);
  }

  static #onHpDelta(_event, target) {
    const delta = Number(target.dataset.delta);
    const health = this.actor.system.characteristics.health;
    const value = Math.min(health.max, Math.max(0, health.value + delta));
    this.actor.update({ "system.characteristics.health.value": value });
  }

  static #onCounterAdd(_event, _target) {
    const counters = this.counters;
    counters.push({ id: foundry.utils.randomID(), name: "New Counter", value: 0, max: null });
    this._setCounters(counters);
  }

  static #onCounterDelta(_event, target) {
    const id = target.dataset.counterId;
    const delta = Number(target.dataset.delta);
    const counters = this.counters;
    const counter = counters.find((c) => c.id === id);
    if (!counter) return;
    const max = counter.max ?? Infinity;
    counter.value = Math.min(max, Math.max(0, counter.value + delta));
    this._setCounters(counters);
  }

  static #onCounterRemove(_event, target) {
    const id = target.dataset.counterId;
    const counters = this.counters.filter((c) => c.id !== id);
    this._setCounters(counters);
  }

  static #onEffectToggle(_event, target) {
    const effect = fromUuidSync(target.dataset.effectUuid);
    effect?.update({ disabled: !effect.disabled });
  }

  static #onEffectsConfig(_event, _target) {
    new EffectsConfigApp(this.actor).render(true);
  }

}
