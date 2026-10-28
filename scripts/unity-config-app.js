import { pairKey, unityParty, pairCost, requestOperation } from "./unity-meter.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODULE_ID = "clustersomnia";

export class UnityConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "sotdl-unity-config",
    tag: "div",
    classes: ["sotdl-unity-config-app"],
    window: {
      title: "Mossa unione: costi",
      icon: "fas fa-link",
      resizable: true
    },
    position: {
      width: 380,
      height: "auto"
    },
    actions: {
      save: UnityConfigApp.#onSave,
      resetUsed: UnityConfigApp.#onResetUsed,
      cancel: UnityConfigApp.#onCancel
    }
  };

  static PARTS = {
    body: {
      template: "modules/clustersomnia/templates/unity-config.hbs"
    }
  };

  async _prepareContext(_options) {
    const party = unityParty();
    const pairs = [];
    for (let i = 0; i < party.length; i++) {
      for (let j = i + 1; j < party.length; j++) {
        pairs.push({
          key: pairKey(party[i].id, party[j].id),
          a: party[i].name,
          b: party[j].name,
          cost: pairCost(party[i].id, party[j].id)
        });
      }
    }
    return { pairs };
  }

  static async #onSave(_event, _target) {
    const defaultCost = game.settings.get(MODULE_ID, "unityDefaultCost");
    const costs = {};
    for (const input of this.element.querySelectorAll("input[data-pair]")) {
      const cost = Math.max(1, Math.round(Number(input.value)) || defaultCost);
      if (cost !== defaultCost) costs[input.dataset.pair] = cost;
    }
    await game.settings.set(MODULE_ID, "unityCosts", costs);
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
