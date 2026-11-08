import {
  MODULE_ID, genesisElements, genesisActive, genesisActor, elementAttackName, composeIcon, attackStyles, styleProfile, damageTypeIcon,
  gigantomachiaOptions, gigantomachiaActive, bloodDropIcon, composeBadges
} from "./alsa-data.js";
import { AlsaConfigApp } from "./alsa-config-app.js";

// Attack flavour in the attack dialog (the one asking for boons and modifiers). Up to three rows can appear:
//  - the attack style (Pugno, Calcio, Testata...) on the Genesis actor's unarmed weapon in human form, and on its
//    cat claws in cat form and its hybrid claws in hybrid form (there with the claws and the bite first);
//  - the Genesis element (Fuoco, Ghiaccio...) on any attack of that actor while Genesis is on;
//  - the Gigantomachia option (Grumi, Raggio, Spuntoni, Sangue) on any attack while Gigantomachia is on. Unlike the
//    others it changes the attack's statistics too: the damage lines of the card (the halved ones, extra damage for the
//    other targets) and, for the spikes, an Agility challenge. A Genesis element and a Gigantomachia option can be
//    chosen together: the option is then the big icon, the weapon and the element are small ones in its corners, the
//    name and the description add up, and the damage type is the element's.
// What is chosen changes how the attack looks on the chat card: its name, icon, description and, for an element,
// the damage type. Nothing is saved on the weapon: the card is made from a view of the item that carries the
// changes, and the real item (its damage and everything technical) stays as it is.

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "genesisConfig", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, "genesisActorId", { scope: "world", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, "genesisEffectName", { scope: "world", config: false, type: String, default: "Genesis" });
  game.settings.register(MODULE_ID, "genesisIconMode", { scope: "world", config: false, type: String, default: "badge" });
  game.settings.register(MODULE_ID, "attackStyleWeapon", { scope: "world", config: false, type: String, default: "Pugno" });
  game.settings.register(MODULE_ID, "attackStyleCatWeapon", { scope: "world", config: false, type: String, default: "Artigli (Gatto)" });
  game.settings.register(MODULE_ID, "attackStyleCatEffect", { scope: "world", config: false, type: String, default: "Forma Gatto" });
  game.settings.register(MODULE_ID, "attackStyleBlockEffects", {
    scope: "world", config: false, type: String, default: "Forma Gatto, Forma Ibrida"
  });
});

// The configuration is opened from the header of the actor's own sheet, by whoever owns that actor (the GM and the
// player controlling it), not from the module settings.
const CONFIG_TITLE = "Modalità Genesis, Gigantomachia e stili del Pugno";

function openConfig() {
  const open = foundry.applications.instances.get("sotdl-genesis-config");
  if (open) open.bringToFront();
  else new AlsaConfigApp().render(true);
}

Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  if (!sheet.actor?.isOwner || sheet.actor.id !== genesisActor()?.id) return;
  buttons.unshift({ label: "", class: "clustersomnia-alsa", icon: "fas fa-wand-sparkles", onclick: openConfig });
});

// Header buttons have no tooltip of their own.
Hooks.on("renderActorSheet", (sheet, html) => {
  const button = (html[0] ?? html).querySelector?.(".clustersomnia-alsa");
  if (button) button.title = CONFIG_TITLE;
});

// The attack the open dialog is for. The weapon attack asks for the dialog on its first line, so the context is
// noted just before it and picked up when the dialog renders.
let pending = null;
// What the open dialog has selected; read when the attack is rolled and dropped when the dialog closes.
let choice = null;
// The icon the damage line of the attack card being made should take (the element's, or the damage type's), and the
// attack's name to recognise the card by (see preCreateChatMessage).
let cardElement = null;

const escape = value => Handlebars.Utils.escapeExpression(value ?? "");
const define = (target, key, value) => Object.defineProperty(target, key, { value, writable: true, configurable: true, enumerable: true });
// The style last used is kept per form: the cat and hybrid claws start from their own first style, not from the punch's.
const styleFlag = profile => ({ cat: "attackStyleLastCat", hybrid: "attackStyleLastHybrid" })[profile] ?? "attackStyleLast";
const hasText = html => Boolean(String(html ?? "").replace(/<[^>]*>/g, "").trim());

/** The name the attack has with the chosen style, before any element is added to it. */
const styledName = (item, style) => style?.name?.trim() || item.name;
/** The icon the attack starts from: the style's, else the weapon's own. */
const baseIcon = (item, style) => style?.icon?.trim() || item.img;

/** Whether a style changes anything: the first one (the plain punch) usually does not. */
function styleChanges(item, style) {
  return Boolean(style) && (styledName(item, style) !== item.name || style.icon?.trim() || hasText(style.description));
}

/**
 * The item as the chat card should see it: the same item, with the style's name, icon and description and, on top of
 * them, those of the "layers" (the plain Gigantomachia option and/or the Genesis element, in that order): their name
 * templates one after the other, their descriptions added after the weapon's, and the last damage type that one of
 * them sets. The weapon's damage and the rest are read from the real item.
 */
function flavorView(item, style, layers, icon) {
  layers = layers.filter(Boolean);
  const action = Object.create(item.system.action);
  const damageType = layers.map(layer => layer.damageType?.trim()).filter(Boolean).at(-1);
  if (damageType) define(action, "damagetype", damageType);
  const system = Object.create(item.system);
  define(system, "action", action);
  // A style's description stands in for the weapon's own (it is flavour); a layer's is added after whatever the card
  // would show, so a weapon's rules text (a poison, a save) is never lost.
  const base = hasText(style?.description) ? style.description : item.system.description;
  if (hasText(style?.description) || layers.some(layer => hasText(layer.description))) {
    define(system, "description", [base, ...layers.map(layer => layer.description)].filter(hasText).join(""));
  }

  const view = Object.create(item);
  define(view, "system", system);
  define(view, "name", layers.reduce((name, layer) => elementAttackName(layer, { name }), styledName(item, style)));
  if (icon) define(view, "img", icon);
  return view;
}

/**
 * The item as the card should see it for a special Gigantomachia option: its own name, icon and description instead of
 * the weapon's, no other damage lines (the card gets its own, see preCreateChatMessage) and, for the spikes, an Agility
 * challenge for the targets. The weapon's damage is still read from the real item. With a Genesis element too, the
 * element's name template and description follow the option's, and its damage type is the one of the main line.
 */
function gigantoView(item, option, element, icon) {
  const action = Object.create(item.system.action);
  define(action, "damagetypes", []);
  if (element?.damageType?.trim()) define(action, "damagetype", element.damageType.trim());
  if (option.id === "spikes") define(action, "defense", "agility");
  const system = Object.create(item.system);
  define(system, "action", action);
  define(system, "description", [option.description, element?.description].filter(hasText).join(""));
  const view = Object.create(item);
  define(view, "system", system);
  const name = option.name?.trim() || item.name;
  define(view, "name", element ? elementAttackName(element, { name }) : name);
  define(view, "img", icon ?? option.icon);
  return view;
}

Hooks.once("ready", () => {
  const proto = CONFIG.Actor.documentClass.prototype;

  const weaponAttack = proto.rollWeaponAttack;
  const itemAttack = proto.rollItemAttack;
  if (typeof weaponAttack !== "function" || typeof itemAttack !== "function") {
    return console.warn(`${MODULE_ID} | rollWeaponAttack / rollItemAttack not found: Genesis mode and attack styles are off`);
  }

  proto.rollWeaponAttack = function (itemId, ...rest) {
    const item = this.items.get(itemId);
    const genesis = Boolean(item) && genesisActive(this);
    const giganto = Boolean(item) && gigantomachiaActive(this);
    const profile = item ? styleProfile(this, item) : null;
    if (genesis || giganto || profile) {
      pending = { actorId: this.id, itemId: item.id, itemName: item.name, genesis, giganto, profile, at: Date.now() };
    }
    return weaponAttack.call(this, itemId, ...rest);
  };

  proto.rollItemAttack = async function (item, ...args) {
    const mine = choice && choice.actorId === this.id && choice.itemId === item?.id ? choice : null;
    const element = mine?.element ? genesisElements().find(candidate => candidate.id === mine.element) : null;
    const style = mine?.style ? attackStyles(mine.profile).find(candidate => candidate.id === mine.style) : null;
    const giganto = mine?.giganto ? gigantomachiaOptions().find(candidate => candidate.id === mine.giganto) : null;

    // The next time the dialog opens, the same element, Gigantomachia option and style are already selected.
    if (mine) {
      const flags = {};
      if (mine.hasElements) flags[`flags.${MODULE_ID}.genesisLast`] = element?.id ?? null;
      if (mine.hasGiganto) flags[`flags.${MODULE_ID}.gigantoLast`] = giganto?.id ?? null;
      if (mine.hasStyles) flags[`flags.${MODULE_ID}.${styleFlag(mine.profile)}`] = style?.id ?? null;
      if (Object.keys(flags).length) this.update(flags).catch(() => {});
    }

    // Each damage line of the card keeps its type's own icon (a fist for blunt damage, a skull for poison...), not the
    // generic sword; the attack's own line takes the element's icon instead when there is an element.
    const action = item.system?.action;
    const typeIcons = new Map();
    if (this.id === genesisActor()?.id) {
      for (const type of new Set([action?.damagetype, ...(action?.damagetypes ?? []).map(entry => entry.damagetype)])) {
        const found = type ? await damageTypeIcon(type) : null;
        if (found) typeIcons.set(String(type).trim().toLowerCase(), found);
      }
    }
    const typeIcon = !element ? typeIcons.get(String(action?.damagetype ?? "").trim().toLowerCase()) ?? null : null;

    // Gigantomachia: the three special options are attacks of their own; the fourth is the normal attack, flavoured.
    if (giganto && !giganto.plain) {
      // The option's own icon, with the element's small in a corner if there is an element.
      const icon = element ? await composeBadges(giganto.icon, [null, element.icon]) : giganto.icon;
      const view = gigantoView(item, giganto, element, icon);
      cardElement = { icon: element?.icon ?? typeIcon, typeIcons, name: view.name, mode: giganto.id, blood: bloodDropIcon(), at: Date.now() };
      return itemAttack.call(this, view, ...args);
    }
    if (giganto) {
      // The plain option: the blood is the big icon, the weapon's small at the right and the element's at the left.
      const start = baseIcon(item, style);
      const icon = element ? await composeBadges(giganto.icon, [start, element.icon]) : await composeIcon(start, giganto.icon);
      const view = flavorView(item, style, [giganto, element], icon);
      cardElement = { icon: element?.icon ?? giganto.icon, typeIcons, name: view.name, at: Date.now() };
      return itemAttack.call(this, view, ...args);
    }

    if (!element && !styleChanges(item, style)) {
      if (typeIcons.size) cardElement = { icon: typeIcon, typeIcons, name: item.name, at: Date.now() };
      return itemAttack.call(this, item, ...args);
    }
    // The attack icon: the style's (or the weapon's), with the element's composed on it as set in the config window.
    const start = baseIcon(item, style);
    const icon = element ? await composeIcon(start, element.icon) : start;
    const view = flavorView(item, style, [element], icon);
    if (element || typeIcons.size) cardElement = { icon: element?.icon ?? typeIcon, typeIcons, name: view.name, at: Date.now() };
    return itemAttack.call(this, view, ...args);
  };
});

/** One row of tiles: the picker for the styles, the elements or the Gigantomachia options. */
function rowMarkup({ cls, title, label, tiles }) {
  return `
    <div class="cs-genesis ${cls}" role="group" aria-label="${escape(label)}">
      <div class="cs-genesis-head"><b>${escape(title)}</b><span class="cs-genesis-preview"></span></div>
      <div class="cs-genesis-grid">${tiles}</div>
    </div>`;
}

Hooks.on("renderDialog", (app, html) => {
  if (!pending || Date.now() - pending.at > 5000) return;
  const root = html[0] ?? html;
  if (!root.querySelector?.("input#boonsbanes") || root.querySelector(".cs-genesis")) return;
  if (!String(app.title).includes(pending.itemName)) return;

  const actor = game.actors.get(pending.actorId);
  const item = actor?.items.get(pending.itemId);
  const { actorId, itemId, genesis, giganto, profile } = pending;
  const withStyles = Boolean(profile);
  pending = null;
  if (!item) return;

  const elements = genesis ? genesisElements() : [];
  const options = giganto ? gigantomachiaOptions() : [];
  const styles = withStyles ? attackStyles(profile) : [];
  const lastElement = actor.getFlag(MODULE_ID, "genesisLast");
  const lastGiganto = actor.getFlag(MODULE_ID, "gigantoLast");
  const lastStyle = actor.getFlag(MODULE_ID, styleFlag(profile));
  choice = {
    app, actorId, itemId,
    hasElements: genesis,
    hasGiganto: giganto,
    hasStyles: withStyles,
    profile,
    element: elements.some(element => element.id === lastElement) ? lastElement : null,
    giganto: options.some(option => option.id === lastGiganto) ? lastGiganto : null,
    // A style is always one of the list: the plain punch (the first) unless another was used last.
    style: withStyles ? (styles.some(style => style.id === lastStyle) ? lastStyle : styles[0].id) : null
  };

  const styleOf = id => styles.find(candidate => candidate.id === id) ?? null;
  const elementOf = id => elements.find(candidate => candidate.id === id) ?? null;
  const optionOf = id => options.find(candidate => candidate.id === id) ?? null;

  const rows = [];
  if (withStyles) {
    rows.push(rowMarkup({
      cls: "cs-styles", title: "Attacco", label: "Stile dell'attacco",
      tiles: styles.map(style => `
        <button type="button" class="cs-el" data-style="${style.id}" style="--el: #8a8478" aria-pressed="false">
          <img src="${escape(baseIcon(item, style))}" alt="">
          <span>${escape(style.label)}</span>
        </button>`).join("")
    }));
  }
  if (genesis) {
    rows.push(rowMarkup({
      cls: "cs-elements", title: "Genesis", label: "Genesis",
      tiles: elements.map(element => `
        <button type="button" class="cs-el" data-element="${element.id}" style="--el: ${escape(element.color)}" aria-pressed="false">
          <img src="${escape(element.icon)}" alt="">
          <span>${escape(element.label)}</span>
        </button>`).join("")
    }));
  }
  if (giganto) {
    rows.push(rowMarkup({
      cls: "cs-giganto", title: "Gigantomachia", label: "Gigantomachia",
      tiles: options.map(option => `
        <button type="button" class="cs-el" data-giganto="${option.id}" style="--el: ${escape(option.color)}" aria-pressed="false">
          <img src="${escape(option.icon)}" alt="">
          <span>${escape(option.label)}</span>
        </button>`).join("")
    }));
  }
  const anchor = root.querySelector(".challengedialog");
  for (const row of rows) anchor.insertAdjacentHTML("beforebegin", row);

  const styleGrid = root.querySelector(".cs-styles .cs-genesis-grid");
  const elementGrid = root.querySelector(".cs-elements .cs-genesis-grid");
  const gigantoGrid = root.querySelector(".cs-giganto .cs-genesis-grid");
  const stylePreview = root.querySelector(".cs-styles .cs-genesis-preview");
  const elementPreview = root.querySelector(".cs-elements .cs-genesis-preview");
  const gigantoPreview = root.querySelector(".cs-giganto .cs-genesis-preview");

  // The element tiles show what the attack icon will look like: each element's icon composed with the one the
  // attack starts from (the chosen style's, so they follow the style row).
  let iconRun = 0;
  const paintElementIcons = () => {
    const run = ++iconRun;
    const start = baseIcon(item, styleOf(choice.style));
    for (const element of elements) {
      composeIcon(start, element.icon).then(src => {
        const image = root.querySelector(`.cs-el[data-element="${element.id}"] img`);
        if (image && run === iconRun) image.src = src;
      });
    }
    // The plain Gigantomachia option is a Genesis-like flavour: its icon has the weapon's small in the corner.
    for (const option of options.filter(candidate => candidate.plain)) {
      composeIcon(start, option.icon).then(src => {
        const image = root.querySelector(`.cs-el[data-giganto="${option.id}"] img`);
        if (image && run === iconRun) image.src = src;
      });
    }
  };

  const paint = () => {
    if (styleGrid) {
      for (const tile of styleGrid.children) {
        const on = tile.dataset.style === choice.style;
        tile.classList.toggle("active", on);
        tile.setAttribute("aria-pressed", String(on));
      }
      const style = styleOf(choice.style);
      stylePreview.textContent = `${styledName(item, style)} · danno invariato`;
    }
    if (elementGrid) {
      for (const tile of elementGrid.children) {
        const on = tile.dataset.element === choice.element;
        tile.classList.toggle("active", on);
        tile.setAttribute("aria-pressed", String(on));
      }
      const element = elementOf(choice.element);
      const chosenOption = optionOf(choice.giganto);
      const baseName = !chosenOption ? styledName(item, styleOf(choice.style))
        : chosenOption.plain ? elementAttackName(chosenOption, { name: styledName(item, styleOf(choice.style)) })
        : chosenOption.name;
      elementPreview.textContent = element
        ? `${elementAttackName(element, { name: baseName })}${element.damageType ? ` · ${element.damageType}` : ""}`
        : "nessun elemento: attacco normale";
    }
    if (gigantoGrid) {
      for (const tile of gigantoGrid.children) {
        const on = tile.dataset.giganto === choice.giganto;
        tile.classList.toggle("active", on);
        tile.setAttribute("aria-pressed", String(on));
      }
      const option = optionOf(choice.giganto);
      const withElement = elementOf(choice.element);
      const named = !option ? "" : option.plain
        ? elementAttackName(option, { name: styledName(item, styleOf(choice.style)) })
        : option.name;
      gigantoPreview.textContent = !option ? "nessuna opzione: attacco normale"
        : option.plain ? (withElement ? elementAttackName(withElement, { name: named }) : named)
        : `${withElement ? elementAttackName(withElement, { name: named }) : named} · statistiche cambiate`;
    }
  };

  styleGrid?.addEventListener("click", event => {
    const tile = event.target.closest("[data-style]");
    if (!tile || tile.dataset.style === choice.style) return;
    choice.style = tile.dataset.style;
    paint();
    paintElementIcons();
  });
  elementGrid?.addEventListener("click", event => {
    const tile = event.target.closest("[data-element]");
    if (!tile) return;
    // Clicking the selected element again goes back to the normal attack.
    choice.element = choice.element === tile.dataset.element ? null : tile.dataset.element;
    paint();
  });
  gigantoGrid?.addEventListener("click", event => {
    const tile = event.target.closest("[data-giganto]");
    if (!tile) return;
    choice.giganto = choice.giganto === tile.dataset.giganto ? null : tile.dataset.giganto;
    paint();
  });
  paint();
  paintElementIcons();
  app.setPosition({ height: "auto" });
});

Hooks.on("closeDialog", app => {
  if (choice?.app === app) choice = null;
});

// The system draws one generic icon on every damage line of the card. The first line is the attack's own damage: it takes
// the element's icon, or its damage type's. The other lines (poison on a bite, for instance) take the icon of their own
// damage type. The card is told apart by the attack name it carries.
const GENERIC_DAMAGE_ICON = "ui/items/damage.webp";

Hooks.on("preCreateChatMessage", message => {
  if (!cardElement || Date.now() - cardElement.at > 8000) return;
  const content = message.content;
  if (typeof content !== "string" || !content.includes(escape(cardElement.name)) || !content.includes(GENERIC_DAMAGE_ICON)) return;

  const page = document.createElement("template");
  page.innerHTML = content;
  let changed = false;
  [...page.content.querySelectorAll(".roll-damage .header")].forEach((line, index) => {
    const image = line.querySelector("img");
    if (!image?.getAttribute("src")?.includes(GENERIC_DAMAGE_ICON)) return;
    const type = String(line.dataset.damagetype ?? "").trim().toLowerCase();
    const icon = index === 0 && cardElement.icon ? cardElement.icon : cardElement.typeIcons.get(type);
    if (!icon) return;
    image.setAttribute("src", icon);
    changed = true;
  });
  if (cardElement.mode) changed = gigantoLines(page.content, cardElement) || changed;
  if (changed) message.updateSource({ content: page.innerHTML });
  cardElement = null;
});

/**
 * The damage lines of a special Gigantomachia attack, made from the weapon's damage on the card (the total, bonuses
 * included):
 *  - clots: two lines, one for each clot;
 *  - ray: the weapon's damage for the main target, and 1d6+3 for the others;
 *  - spikes: the weapon's damage, and 1d6 more for those who fail the Agility challenge.
 * The lines that are to be halved (the clots, with +3, and the spikes) roll the normal damage, dice and all; the card
 * of that roll then adds "Danno dimezzato corrisponde a: N" under it (see the click and message hooks below), N being
 * half of the total rounded down, plus the bonus. The line carries the bonus in data-cs-half.
 */
function gigantoLines(page, context) {
  const lines = [...page.querySelectorAll(".roll-damage")];
  const first = lines[0];
  const head = first?.querySelector(".header");
  if (!head?.dataset.damage) return false;
  const word = game.i18n.localize("DL.WeaponDamage");
  const total = head.dataset.damage;
  const type = head.dataset.damagetype ?? "";

  const fill = (line, { formula, label, damageType = type, icon, half }) => {
    const header = line.querySelector(".header");
    header.dataset.damage = formula;
    header.dataset.damagetype = damageType;
    if (half !== undefined) header.dataset.csHalf = String(half);
    const text = [...header.querySelectorAll("div")].at(-1);
    if (text) text.textContent = `${label} ${word} (${formula})`;
    if (icon) header.querySelector("img")?.setAttribute("src", icon);
  };
  const copy = options => {
    const line = first.cloneNode(true);
    // The copy must not inherit the first line's halving mark: it has one only if its own options say so.
    delete line.querySelector(".header").dataset.csHalf;
    fill(line, options);
    first.parentNode.insertBefore(line, lines.at(-1).nextSibling);
    lines.push(line);
  };
  // Whatever other damage lines there were (a poison, for example) belong to the weapon, not to this attack.
  for (const extra of lines.slice(1)) extra.remove();
  lines.length = 1;
  const mainIcon = first.querySelector("img")?.getAttribute("src");

  if (context.mode === "clots") {
    fill(first, { formula: total, label: "Grumo 1", half: 3 });
    copy({ formula: total, label: "Grumo 2", icon: mainIcon, half: 3 });
  } else if (context.mode === "ray") {
    fill(first, { formula: total, label: "Bersaglio principale" });
    copy({ formula: "1d6+3", label: "Altri bersagli", damageType: "Sangue", icon: context.blood });
  } else if (context.mode === "spikes") {
    fill(first, { formula: total, label: "Spuntoni", half: 0 });
    copy({ formula: "1d6", label: "Agilità fallita", damageType: "Sangue", icon: context.blood });
  } else return false;
  return true;
}

// The click on a damage line that is to be halved is noted here, so the damage card it makes can say what the halved
// damage is: the listener runs before the system's own, which rolls the damage and posts the card.
let pendingHalf = null;

document.addEventListener("click", event => {
  const line = event.target.closest?.(".roll-damage .header");
  pendingHalf = line?.dataset.csHalf !== undefined ? { bonus: Number(line.dataset.csHalf) || 0, at: Date.now() } : null;
}, true);

Hooks.on("preCreateChatMessage", message => {
  if (!pendingHalf || Date.now() - pendingHalf.at > 6000) return;
  const total = message.rolls?.[0]?.total;
  const content = message.content;
  if (!Number.isFinite(total) || typeof content !== "string" || !content.includes("apply-damage")) return;

  const { bonus } = pendingHalf;
  pendingHalf = null;
  const page = document.createElement("template");
  page.innerHTML = content;
  const header = page.content.querySelector("header");
  if (!header) return;
  const half = Math.floor(total / 2) + bonus;
  header.insertAdjacentHTML("afterend", `<div class="cs-half">Danno dimezzato corrisponde a: <b>${half}</b>${bonus ? ` (metà per difetto + ${bonus})` : ""}</div>`);
  message.updateSource({ content: page.innerHTML });
});
