import { pairKey, unionParty, pairCost, requestOperation, bubbleImage, defaultBubble, shortName } from "./union-meter.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODULE_ID = "clustersomnia";

export class UnionConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "sotdl-union-config",
    tag: "div",
    classes: ["sotdl-union-config-app"],
    window: {
      title: "Mossa unione: costi",
      icon: "fas fa-link",
      resizable: true
    },
    position: {
      width: 520,
      height: "auto"
    },
    actions: {
      pickImage: UnionConfigApp.#onPickImage,
      resetImage: UnionConfigApp.#onResetImage,
      save: UnionConfigApp.#onSave,
      resetUsed: UnionConfigApp.#onResetUsed,
      cancel: UnionConfigApp.#onCancel
    }
  };

  static PARTS = {
    body: {
      template: "modules/clustersomnia/templates/union-config.hbs"
    }
  };

  async _prepareContext(_options) {
    const defaultCost = game.settings.get(MODULE_ID, "unionDefaultCost");
    const used = game.settings.get(MODULE_ID, "unionState").used ?? [];
    const people = unionParty().map(actor => ({
      id: actor.id, name: actor.name, img: actor.img, short: shortName(actor)
    }));

    // Staircase matrix: each pair appears once, above the diagonal.
    const columns = people.slice(1);
    const rows = people.slice(0, -1).map((actor, i) => ({
      actor,
      cells: columns.map((other, j) => {
        if (j < i) return {};
        const key = pairKey(actor.id, other.id);
        const cost = pairCost(actor.id, other.id);
        return {
          key, cost,
          changed: cost !== defaultCost,
          used: used.includes(key),
          label: `${actor.name} + ${other.name}`
        };
      })
    }));
    // Bubble images are edited in place and written to the setting only on save.
    this.images = Object.fromEntries(unionParty().map(actor => [actor.id, bubbleImage(actor)]));
    const images = unionParty().map(actor => ({ id: actor.id, name: actor.name, short: shortName(actor), src: this.images[actor.id] }));
    return { defaultCost, columns, rows, images };
  }

  #setImage(actorId, src) {
    this.images[actorId] = src;
    this.element.querySelector(`.suc-image[data-actor="${actorId}"] img`).src = src;
  }

  static #onPickImage(_event, target) {
    const actorId = target.closest(".suc-image").dataset.actor;
    new FilePicker({
      type: "image",
      current: this.images[actorId],
      callback: path => this.#setImage(actorId, path)
    }).browse();
  }

  static #onResetImage(_event, target) {
    const actorId = target.closest(".suc-image").dataset.actor;
    this.#setImage(actorId, defaultBubble(game.actors.get(actorId)));
  }

  _onRender(_context, _options) {
    const base = this.element.querySelector("input[name=defaultCost]");
    const inputs = [...this.element.querySelectorAll(".suc-cell input")];

    // Cells that differ from the base cost light up while typing, not only after saving.
    const syncChanged = () => {
      for (const input of inputs) {
        input.closest(".suc-cell").classList.toggle("changed", Number(input.value) !== Number(base.value));
      }
    };
    base.addEventListener("input", syncChanged);

    // Hovering or focusing a cell marks both PGs of the pair in the headers.
    const mark = (input, on) => {
      const cell = input.closest("td");
      cell.closest("tr").querySelector("th")?.classList.toggle("hot", on);
      cell.closest("table").tHead.rows[0].cells[cell.cellIndex]?.classList.toggle("hot", on);
    };

    for (const input of [base, ...inputs]) {
      input.addEventListener("focus", () => input.select());
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") this.element.querySelector("[data-action=save]").click();
      });
    }
    for (const input of inputs) {
      input.addEventListener("input", syncChanged);
      for (const [type, on] of [["mouseenter", true], ["mouseleave", false], ["focus", true], ["blur", false]]) {
        input.addEventListener(type, () => mark(input, on));
      }
    }
  }

  static async #onSave(_event, _target) {
    const baseInput = this.element.querySelector("input[name=defaultCost]");
    const current = game.settings.get(MODULE_ID, "unionDefaultCost");
    const defaultCost = Math.min(100, Math.max(1, Math.round(Number(baseInput.value)) || current));
    if (defaultCost !== current) await game.settings.set(MODULE_ID, "unionDefaultCost", defaultCost);
    const costs = {};
    for (const input of this.element.querySelectorAll("input[data-pair]")) {
      const cost = Math.max(1, Math.round(Number(input.value)) || defaultCost);
      if (cost !== defaultCost) costs[input.dataset.pair] = cost;
    }
    await game.settings.set(MODULE_ID, "unionCosts", costs);

    const images = {};
    for (const [actorId, src] of Object.entries(this.images)) {
      if (src !== defaultBubble(game.actors.get(actorId))) images[actorId] = src;
    }
    await game.settings.set(MODULE_ID, "unionImages", images);
    this.close();
  }

  static async #onResetUsed(_event, _target) {
    await requestOperation("resetUsed");
    ui.notifications.info("Mosse unione usate azzerate.");
  }

  static #onCancel(_event, _target) {
    this.close();
  }
}
