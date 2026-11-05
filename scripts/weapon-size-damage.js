const MODULE_ID = "clustersomnia";
const FLAG = "damageBySize";
const RULE_FLAG = "sizeRule";

// A weapon can carry a table of damage by creature size ("Damage by size" on the weapon sheet). When the weapon is
// used, the attacker's size at that moment picks the row and that damage replaces the weapon's base damage for the
// roll. The table lives in the item flag `clustersomnia.damageBySize` = `[{ size: "1/4", damage: "1" }, ...]`.

// The sizes the system knows, as written on the sheet.
const SIZES = ["1/4", "1/2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/** A number or a fraction such as "1/4"; NaN when it is neither. */
function sizeNumber(value) {
  const [top, bottom] = String(value ?? "").trim().split("/");
  return bottom === undefined ? parseFloat(top) : parseFloat(top) / parseFloat(bottom);
}

function tableOf(item) {
  const rows = item.getFlag(MODULE_ID, FLAG);
  return Array.isArray(rows) ? rows.filter(row => Number.isFinite(sizeNumber(row.size)) && String(row.damage ?? "").trim()) : [];
}

/**
 * The size rule of the game: a weapon deals 1d6 extra damage for each point of Size above 1. A weapon below 1d6
 * first goes up to 1d6 at Size 2 and then gains 1d6 per point above 2, so it deals (Size - 1)d6 in all. Flat bonuses
 * stay. "Below 1d6" is decided simply: a single die from d2 to d5, or a damage with no dice at all (a plain 1).
 * Returns `undefined` when the rule changes nothing (Size 1 or smaller, or a damage that cannot be read).
 */
export function ruleDamage(base, size) {
  const text = String(base ?? "").trim();
  const extra = Math.floor(size) - 1;
  if (!text || !Number.isFinite(extra) || extra < 1) return undefined;

  const dice = [...text.matchAll(/(\d*)d(\d+)/gi)];
  const small = dice.length === 0 || (dice.length === 1 && (dice[0][1] === "" || dice[0][1] === "1") && Number(dice[0][2]) >= 2 && Number(dice[0][2]) <= 5);

  if (small) {
    // The die (if any) is dropped and what is left (the flat bonus) is kept: 1d3+1 at Size 3 becomes 2d6+1.
    const rest = dice.length ? text.replace(dice[0][0], "").trim() : "";
    return `${extra}d6${rest}`;
  }
  // Already 1d6 or more: Size adds on top. A damage that is plain d6 dice merges (2d6+1 at Size 3 becomes 4d6+1).
  const d6 = /^(\d*)d6(.*)$/i.exec(text);
  if (d6) return `${(d6[1] === "" ? 1 : Number(d6[1])) + extra}d6${d6[2]}`;
  return `${text}+${extra}d6`;
}

/**
 * The damage the weapon does for an attacker of `size`: the table row with that exact size, else the largest listed
 * size below it; failing that, the size rule when the weapon follows it; failing that, nothing (the weapon's base
 * damage stays). Returns `undefined` when there is nothing to override.
 */
export function damageForSize(item, size) {
  const current = sizeNumber(size);
  if (!Number.isFinite(current)) return undefined;
  const candidates = tableOf(item)
    .map(row => ({ at: sizeNumber(row.size), damage: String(row.damage).trim() }))
    .filter(row => row.at <= current)
    .sort((a, b) => b.at - a.at);
  if (candidates.length) return candidates[0].damage;
  if (item.getFlag(MODULE_ID, RULE_FLAG)) return ruleDamage(item.system?.action?.damage, current);
  return undefined;
}

/* -------------------------------------------- */
/*  Using the weapon                             */
/* -------------------------------------------- */

// The attack builds its chat card from `item.system.action.damage`, so that value is swapped for the size's damage
// while the attack runs (in memory only: nothing is saved) and put back afterwards.
Hooks.once("ready", () => {
  const proto = CONFIG.Actor.documentClass.prototype;
  const original = proto.rollItemAttack;
  if (typeof original !== "function") return console.warn(`${MODULE_ID} | rollItemAttack not found: weapon damage by size is off`);

  proto.rollItemAttack = async function (item, ...args) {
    const damage = item?.type === "weapon" ? damageForSize(item, this.system?.characteristics?.size) : undefined;
    if (damage === undefined || !item.system?.action) return original.call(this, item, ...args);
    const action = item.system.action;
    const base = action.damage;
    action.damage = damage;
    try {
      return await original.call(this, item, ...args);
    } finally {
      action.damage = base;
    }
  };
});

/* -------------------------------------------- */
/*  The weapon sheet                             */
/* -------------------------------------------- */

function rowMarkup(row, index, editable) {
  const options = SIZES.map(size => `<option value="${size}"${size === String(row.size) ? " selected" : ""}>${size}</option>`).join("");
  // The sheet styles its rows through the group that holds them, so these borrow the damage row's group class.
  return `<div class="item-group-damage"><div class="input-group cs-size-row" data-index="${index}">
    <span>Size</span><span class="sep"></span>
    <select class="input-group-dropdown cs-size" ${editable ? "" : "disabled"}>${options}</select>
    <span class="sep"></span>
    <input type="text" class="input-group-textbox cs-damage" value="${Handlebars.Utils.escapeExpression(row.damage ?? "")}" placeholder="xdY+z" ${editable ? "" : "disabled"}>
    ${editable ? `<span class="sep"></span><a class="dl-clickable cs-remove input-group-button" title="Remove"><i class="fas fa-trash"></i></a>` : ""}
  </div></div>`;
}

Hooks.on("renderDLBaseItemSheet", (sheet, html) => {
  const item = sheet.document ?? sheet.item;
  if (item?.type !== "weapon") return;
  const root = html instanceof HTMLElement ? html : html[0] ?? sheet.element;
  const damageInput = root.querySelector('input[name="system.action.damage"]');
  const damageSection = damageInput?.closest(".dl-item-section");
  if (!damageSection) return;

  root.querySelectorAll(".cs-damage-by-size").forEach(element => element.remove());
  const editable = sheet.isEditable !== false;
  const rows = tableOf(item).sort((a, b) => sizeNumber(a.size) - sizeNumber(b.size));

  const section = document.createElement("div");
  section.className = "dl-item-section item-properties cs-damage-by-size";
  // What the rule gives for a few sizes with this weapon's damage, so the checkbox says what it will do.
  const base = damageInput.value;
  const preview = [2, 3, 4].map(size => `Size ${size}: ${ruleDamage(base, size) ?? base}`).join(" · ");
  const ruleOn = Boolean(item.getFlag(MODULE_ID, RULE_FLAG));

  section.innerHTML = `<b data-tooltip="Damage used instead of the base damage, by the attacker's size when the weapon is used">Damage by size</b>
    <div class="dl-item-section-column">
      <div class="item-group-damage"><div class="input-group cs-rule${ruleOn ? " on" : ""}" role="switch" aria-checked="${ruleOn}" ${editable ? `tabindex="0"` : ""} title="+1d6 for each point of Size above 1 (a 1d2–1d5 weapon becomes 1d6 at Size 2 first); flat bonuses stay; the table below wins. With this weapon: ${Handlebars.Utils.escapeExpression(preview)}">
        <span class="cs-rule-label">Follow the size rule</span><span class="sep"></span>
        <i class="cs-rule-icon fa-solid ${ruleOn ? "fa-toggle-on" : "fa-toggle-off"}"></i>
      </div></div>
      ${rows.map((row, index) => rowMarkup(row, index, editable)).join("")}
      ${editable ? `<div class="item-group-damage"><div class="input-group cs-add" role="button" tabindex="0" title="Add a size">
        <span class="cs-add-label">Add a size</span><span class="sep"></span>
        <a class="dl-clickable input-group-button" tabindex="-1"><i class="icon-add themed-icon"></i></a>
      </div></div>` : ""}
      ${!rows.length && !editable ? `<div class="item-group-damage"><div class="input-group"><span>—</span></div></div>` : ""}
    </div>`;
  damageSection.after(section);
  if (!editable) return;

  // Every change writes the whole table; the sheet then redraws from the saved flag.
  const save = list => item.setFlag(MODULE_ID, FLAG, list.filter(row => row.size && String(row.damage ?? "").trim() !== ""));
  const current = () => section.querySelectorAll(".cs-size-row");
  const read = () => [...current()].map(row => ({ size: row.querySelector(".cs-size").value, damage: row.querySelector(".cs-damage").value.trim() }));

  section.addEventListener("change", event => {
    if (event.target.closest(".cs-size-row")) save(read());
  });

  // The switch turns the size rule on or off for this weapon (click, or Enter / Space on the keyboard).
  const rule = section.querySelector(".cs-rule");
  const toggleRule = () => item.setFlag(MODULE_ID, RULE_FLAG, !ruleOn);
  rule?.addEventListener("click", toggleRule);
  rule?.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleRule();
    }
  });
  const add = () => {
    const used = new Set(rows.map(row => String(row.size)));
    const size = SIZES.find(candidate => !used.has(candidate)) ?? "1";
    // A new row starts from the weapon's base damage; it only counts once it is saved with a damage.
    save([...read(), { size, damage: damageInput.value || "1" }]);
  };
  const addRow = section.querySelector(".cs-add");
  addRow?.addEventListener("click", add);
  // The row is a button for the keyboard too.
  addRow?.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      add();
    }
  });
  section.querySelectorAll(".cs-remove").forEach(button => button.addEventListener("click", () => {
    const index = Number(button.closest(".cs-size-row").dataset.index);
    save(read().filter((_, i) => i !== index));
  }));
});
