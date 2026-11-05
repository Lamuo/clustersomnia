import { EffectsConfigApp } from "./effects-config-app.js";
import { persistenceActor, displayedEffects } from "./persistence.js";
import { TAG_CATEGORIES, MAX_STEPS, automaticTags, levelOf, manualTags } from "./tags.js";

// What a tag button or a "from effects" item shows: arrows by direction and the colour tier of its steps.
function tagDisplay(signed) {
  if (!signed) return { steps: 0, up: false, down: false, tier: 0, glyphs: "" };
  const { tier, arrows, special } = levelOf(Math.abs(signed));
  const up = signed > 0;
  // The special last step has no arrows: a star for a buff, a cross for a debuff.
  const glyphs = special ? (up ? "★" : "✖") : (up ? "▲" : "▼").repeat(arrows);
  return { steps: Math.abs(signed), up, down: !up, tier, glyphs };
}

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
      counterIcon: TrackerApp.#onCounterIcon,
      tagCycle: TrackerApp.#onTagCycle,
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
    // Counters live on the world actor, like the effect selection: opened from an unlinked token, the tracker
    // would otherwise save them on that token alone and the party cards (which read the world actor) never see them.
    return foundry.utils.deepClone(persistenceActor(this.actor).getFlag(FLAG_NAMESPACE, "counters") ?? []);
  }

  async _setCounters(counters) {
    await persistenceActor(this.actor).setFlag(FLAG_NAMESPACE, "counters", counters);
  }

  get allEffects() {
    return Array.from(this.actor.allApplicableEffects());
  }

  get effects() {
    return displayedEffects(this.actor);
  }

  // One button per tag category: off, up or down, set by hand for what no effect describes.
  get tagContext() {
    const manual = manualTags(this.actor);
    return TAG_CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      name: category.name,
      ...tagDisplay(manual[category.id] ?? 0)
    }));
  }

  _isEffectRelevant(effect) {
    return effect.parent?.id === this.actor.id || effect.parent?.actor?.id === this.actor.id;
  }

  async _prepareContext(_options) {
    return {
      actor: this.actor,
      health: this.actor.system.characteristics.health,
      counters: this.counters,
      effects: this.effects,
      tags: this.tagContext,
      autoTags: automaticTags(this.actor).map((tag) => ({
        ...tag,
        ...tagDisplay(tag.dir === "up" ? tag.steps : -tag.steps),
        sources: tag.sources.join(", ")
      }))
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
    // Right click on the icon button takes the icon off.
    for (const button of this.element.querySelectorAll(".sotdl-counter-icon")) {
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this._onCounterFieldChange(event, "icon", null);
      });
    }
    for (const button of this.element.querySelectorAll(".sotdl-tag-button")) {
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this._stepTag(button.dataset.tagId, -1);
      });
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

  // Foundry's own file picker, so the icon is chosen like any other image.
  static #onCounterIcon(_event, target) {
    const id = target.dataset.counterId;
    const current = this.counters.find((c) => c.id === id)?.icon ?? "";
    new FilePicker({
      type: "image",
      current,
      callback: (path) => {
        const counters = this.counters;
        const counter = counters.find((c) => c.id === id);
        if (!counter) return;
        counter.icon = path;
        this._setCounters(counters);
      }
    }).render(true);
  }

  // Off -> up -> down -> off; stored on the world actor, like the counters.
  // Left click adds a buff step to a category, right click a debuff step (so it also takes them away).
  static #onTagCycle(event, target) {
    // A right click is handled by its own listener (see _onRender); only the left one is this action.
    if (event.type !== "click") return;
    return this._stepTag(target.dataset.tagId, 1);
  }

  _stepTag(id, delta) {
    const current = manualTags(this.actor)[id] ?? 0;
    const next = Math.max(-MAX_STEPS, Math.min(MAX_STEPS, current + delta));
    if (next === current) return;
    // "-=" is how a key is deleted from an object flag; setFlag would only merge.
    const path = `flags.${FLAG_NAMESPACE}.tags.${next ? id : `-=${id}`}`;
    return persistenceActor(this.actor).update({ [path]: next || null });
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
