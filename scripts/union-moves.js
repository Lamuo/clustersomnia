import { pairKey, unionParty, shortName } from "./union-meter.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODULE_ID = "clustersomnia";

/**
 * The union move assigned to each pair of fighters: the world setting `unionMoves` `{ [pairKey]: { uuid, name, img } }`,
 * set by dragging an item from a compendium onto the pair's cell in UnionMovesApp. When a ready pair is used from the
 * union meter, `useUnionMove` plays that item as a normal use of the item, so it lands in chat the way a click on it
 * from the sheet would (the system's own roll for a talent, a spell or a weapon).
 */
export const unionMoves = () => game.settings.get(MODULE_ID, "unionMoves") ?? {};

/**
 * Plays the move assigned to the pair `a` + `b`, as `a` (the PG whose card was clicked) when the user owns it, else as `b`.
 * The system uses items that sit on the actor, so the first time the item is copied onto that PG (flagged, and reused
 * afterwards: it is found again by the pair and the source it was copied from, so changing the assignment copies the
 * new one). Runs on the clicking user's client, so the system's dialogs and the user's targets are theirs.
 * Returns false when the pair has no move (the meter then just spends the points).
 */
export async function useUnionMove(a, b) {
  const key = pairKey(a.id, b.id);
  const move = unionMoves()[key];
  if (!move) return false;
  const actor = [a, b].find(candidate => candidate.isOwner);
  if (!actor) return false;
  const source = await fromUuid(move.uuid);
  if (!source) {
    ui.notifications.warn(`Mossa unione: l'oggetto "${move.name}" non esiste più.`);
    return false;
  }

  const same = item => {
    const flag = item.getFlag(MODULE_ID, "unionMove");
    return flag?.key === key && flag?.source === move.uuid;
  };
  let item = actor.items.find(same);
  if (!item) {
    const data = source.toObject();
    delete data._id;
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.unionMove`, { key, source: move.uuid });
    [item] = await actor.createEmbeddedDocuments("Item", [data]);
  }

  // What limits a union move is the PU, not the item's own uses: the system counts the uses (talent) and castings
  // (spell) it has made, and refuses at the maximum ("usi massimi raggiunti"). So the count starts from zero each time.
  const reset = {};
  if (Number(item.system?.uses?.value)) reset["system.uses.value"] = 0;
  if (Number(item.system?.castings?.value)) reset["system.castings.value"] = 0;
  if (Object.keys(reset).length) await item.update(reset);

  switch (item.type) {
    case "talent": await actor.rollTalent(item.id); break;
    case "spell": await actor.rollSpell(item.id); break;
    case "weapon": await actor.rollWeaponAttack(item.id); break;
    default:
      if (item.system?.action?.attack !== undefined && typeof actor.useItem === "function") await actor.useItem(item, 0, 0);
      else await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<h3>${Handlebars.Utils.escapeExpression(item.name)}</h3>${item.system?.description ?? ""}`
      });
  }
  return true;
}

export class UnionMovesApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "sotdl-union-moves",
    tag: "div",
    classes: ["sotdl-union-config-app", "sotdl-union-moves-app"],
    window: {
      title: "Mossa unione: assegna mosse",
      icon: "fas fa-wand-sparkles",
      resizable: true
    },
    position: {
      width: 520,
      height: "auto"
    },
    actions: {
      openMove: UnionMovesApp.#onOpen,
      clearMove: UnionMovesApp.#onClear,
      close: UnionMovesApp.#onClose
    }
  };

  static PARTS = {
    body: {
      template: "modules/clustersomnia/templates/union-moves.hbs"
    }
  };

  async _prepareContext(_options) {
    const moves = unionMoves();
    const people = unionParty().map(actor => ({
      id: actor.id, name: actor.name, img: actor.img, short: shortName(actor)
    }));
    // Staircase matrix, like the costs: each pair appears once, above the diagonal.
    const columns = people.slice(1);
    const rows = people.slice(0, -1).map((actor, i) => ({
      actor,
      cells: columns.map((other, j) => {
        if (j < i) return {};
        const key = pairKey(actor.id, other.id);
        return { key, move: moves[key] ?? null, label: `${actor.name} + ${other.name}` };
      })
    }));
    return { columns, rows };
  }

  _onRender(_context, _options) {
    for (const zone of this.element.querySelectorAll(".sum-drop")) {
      zone.addEventListener("dragover", event => {
        event.preventDefault();
        zone.classList.add("over");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("over"));
      zone.addEventListener("drop", event => this.#onDrop(event, zone));
    }
    // Hovering a cell marks both PGs of the pair in the headers, as in the costs matrix.
    for (const zone of this.element.querySelectorAll(".sum-drop")) {
      const mark = on => {
        const cell = zone.closest("td");
        cell.closest("tr").querySelector("th")?.classList.toggle("hot", on);
        cell.closest("table").tHead.rows[0].cells[cell.cellIndex]?.classList.toggle("hot", on);
      };
      zone.addEventListener("mouseenter", () => mark(true));
      zone.addEventListener("mouseleave", () => mark(false));
    }
  }

  async #onDrop(event, zone) {
    event.preventDefault();
    zone.classList.remove("over");
    const data = TextEditor.getDragEventData(event);
    if (data?.type !== "Item") return ui.notifications.warn("Trascina qui un oggetto (talento, magia, arma…) da un compendio.");
    const item = await Item.implementation.fromDropData(data);
    if (!item) return;
    const moves = foundry.utils.deepClone(unionMoves());
    moves[zone.dataset.pair] = { uuid: item.uuid, name: item.name, img: item.img };
    await game.settings.set(MODULE_ID, "unionMoves", moves);
    this.render();
  }

  static async #onClear(_event, target) {
    const moves = foundry.utils.deepClone(unionMoves());
    delete moves[target.closest(".sum-drop").dataset.pair];
    await game.settings.set(MODULE_ID, "unionMoves", moves);
    this.render();
  }

  static async #onOpen(_event, target) {
    const move = unionMoves()[target.closest(".sum-drop").dataset.pair];
    (await fromUuid(move?.uuid))?.sheet.render(true);
  }

  static #onClose(_event, _target) {
    this.close();
  }
}

// A union move is named "Title - 3 PU - Alsa/Diane": in the chat card the title stands alone and the cost and the pair
// go on a quieter line under it, instead of one long line that wraps. Other cards are left as they are.
Hooks.on("renderChatMessage", (_message, html) => {
  const root = html[0] ?? html;
  for (const el of root.querySelectorAll(".card-header .headertext")) {
    const match = el.textContent.trim().match(/^(.+?)\s+-\s+(\d+\s*PU)\s+-\s+(.+)$/i);
    if (!match) continue;
    const [, title, cost, pair] = match;
    const strong = Object.assign(document.createElement("span"), { className: "cs-move-title", textContent: title });
    const meta = Object.assign(document.createElement("span"), { className: "cs-move-meta", textContent: `${cost} · ${pair}` });
    el.replaceChildren(strong, meta);
  }
});
