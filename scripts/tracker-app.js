import { EffectsConfigApp } from "./effects-config-app.js";
import { tempHp, setTempHp } from "./temp-hp.js";
import { persistenceActor, displayedEffects, realActor, effectKey, burst, pendingBurst, stepCounter, counterKey } from "./persistence.js";
import { shownOnCard, toggleCardMode } from "./card-visibility.js";
import { TAG_CATEGORIES, automaticTags, manualTags, tagDisplay, stepManualTag } from "./tags.js";

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
      tempDelta: TrackerApp.#onTempDelta,
      counterAdd: TrackerApp.#onCounterAdd,
      counterDelta: TrackerApp.#onCounterDelta,
      counterRemove: TrackerApp.#onCounterRemove,
      counterIcon: TrackerApp.#onCounterIcon,
      tagCycle: TrackerApp.#onTagCycle,
      effectToggle: TrackerApp.#onEffectToggle,
      effectsConfig: TrackerApp.#onEffectsConfig,
      cardToggle: TrackerApp.#onCardToggle
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

  // The small "on the cards" zone: every element the party cards can show, with where it goes (simple / advanced).
  get cardRows() {
    const row = (key, name, extra = {}) => ({
      key, name,
      simple: shownOnCard(this.actor, key, false),
      advanced: shownOnCard(this.actor, key, true),
      ...extra
    });
    return [
      row("tags", game.i18n.localize("CLUSTERSOMNIA.CardTags"), { icon: "fas fa-angles-up" }),
      ...this.counters.map(counter => row(`counter:${counter.id}`, counter.name, { img: counter.icon, icon: "fas fa-hashtag" })),
      ...this.effects.map(effect => row(effectKey(effect), effect.name, { img: effect.img }))
    ];
  }

  _isEffectRelevant(effect) {
    return effect.parent?.id === this.actor.id || effect.parent?.actor?.id === this.actor.id;
  }

  async _prepareContext(_options) {
    return {
      actor: this.actor,
      // The real hit points: those of the world actor for a PG, the same ones the sheet and the party cards show.
      health: realActor(this.actor).system.characteristics.health,
      // `health.value` is the damage taken (see CLAUDE.md), so the hit points left are max - value.
      hp: realActor(this.actor).system.characteristics.health.max - realActor(this.actor).system.characteristics.health.value,
      tempHp: tempHp(this.actor),
      // A value still waiting to be written (a click burst) is the one to show, not the saved one.
      counters: this.counters.map((counter) => ({ ...counter, value: pendingBurst(counterKey(this.actor, counter.id)) ?? counter.value })),
      effects: this.effects,
      cardRows: this.cardRows,
      showTags: game.settings.get(FLAG_NAMESPACE, "trackerShowTags"),
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
        this._stepTag(button.dataset.tagId, -1, button);
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
    // The buttons change the hit points (+1 heals); the stored number is the damage, which moves the other way.
    const delta = -Number(target.dataset.delta);
    const actor = realActor(this.actor);
    const health = actor.system.characteristics.health;
    const value = Math.min(health.max, Math.max(0, health.value + delta));
    actor.update({ "system.characteristics.health.value": value });
  }

  static #onTempDelta(_event, target) {
    const actor = this.actor;
    const label = target.closest(".sotdl-tracker-hp-controls")?.querySelector(".sotdl-tracker-hp-value");
    burst(`temp|${realActor(actor).uuid}`, tempHp(actor), (base) => Math.max(0, base + Number(target.dataset.delta)), {
      paint: (value) => { if (label) label.textContent = value; },
      write: (value) => setTempHp(actor, value)
    });
  }

  static #onCounterAdd(_event, _target) {
    const counters = this.counters;
    counters.push({ id: foundry.utils.randomID(), name: game.i18n.localize("CLUSTERSOMNIA.NewCounter"), value: 0, max: null });
    this._setCounters(counters);
  }

  static #onCounterDelta(_event, target) {
    const id = target.dataset.counterId;
    const row = target.closest("[data-counter-row]");
    // The value shows at once and a burst of clicks is one write (stepCounter); the render after it redraws the rest.
    stepCounter(this.actor, id, Number(target.dataset.delta), {
      paint: (value) => {
        const label = row?.querySelector(".sotdl-counter-value");
        if (label) label.textContent = value;
      }
    });
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
    return this._stepTag(target.dataset.tagId, 1, target);
  }

  _stepTag(id, delta, button) {
    return stepManualTag(this.actor, id, delta, { button });
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

  static #onCardToggle(_event, target) {
    return toggleCardMode(this.actor, target.dataset.key, target.dataset.side);
  }

  static #onEffectsConfig(_event, _target) {
    new EffectsConfigApp(this.actor).render(true);
  }

}
