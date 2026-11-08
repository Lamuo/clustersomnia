// Quick-pick buttons for the system's roll dialog (attack, spell, challenge, talent/item VS).
// The system's dialog is a plain Dialog with two number inputs, #boonsbanes and #modifier, that its
// roll callback reads. We only fill those inputs, so the system's own logic is untouched.
// Both rows work the same way: each chip adds to (or subtracts from) the field, the arrow clears it.

const BOON_STEPS = [-3, -2, -1, 1, 2, 3];
const MOD_STEPS = [-5, -2, -1, 1, 2, 5];

const signed = n => (n > 0 ? `+${n}` : `${n}`);

function rowMarkup(cls, label, attr, steps, kindOf) {
  const chips = steps.map(n => `<button type="button" class="cs-chip ${kindOf(n)}" data-${attr}="${n}">${signed(n)}</button>`).join("");
  return `<div class="cs-quick ${cls}" role="group" aria-label="${label}">
    <div class="cs-chips">${chips}<button type="button" class="cs-chip cs-clear" data-${attr}="clear" title="0"><i class="fas fa-rotate-left"></i></button></div>
  </div>`;
}

Hooks.on("renderDialog", (app, html) => {
  const root = html[0] ?? html;
  const boons = root.querySelector?.("input#boonsbanes");
  const mod = root.querySelector?.("input#modifier");
  if (!boons || !mod || root.querySelector(".cs-quick")) return;

  const boonsRow = boons.closest(".challengedialog");
  const modRow = mod.closest(".challengedialog");
  boonsRow.classList.add("cs-row");
  modRow.classList.add("cs-row");
  boonsRow.insertAdjacentHTML("afterend", rowMarkup("cs-boons", game.i18n.localize("DL.DialogAddBonesAndBanes"), "boons", BOON_STEPS, n => (n < 0 ? "cs-bane" : "cs-boon")));
  modRow.insertAdjacentHTML("afterend", rowMarkup("cs-mods", game.i18n.localize("DL.ModsAdd"), "mod", MOD_STEPS, n => (n < 0 ? "cs-neg" : "cs-pos")));

  const num = input => parseInt(input.value) || 0;
  const paint = () => {
    boons.classList.toggle("cs-set", num(boons) !== 0);
    mod.classList.toggle("cs-set", num(mod) !== 0);
  };
  const setValue = (input, value) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    paint();
  };
  const wire = (row, input, attr) => row.addEventListener("click", event => {
    const b = event.target.closest(`[data-${attr}]`);
    if (!b) return;
    const v = b.dataset[attr];
    setValue(input, v === "clear" ? 0 : num(input) + Number(v));
  });
  wire(root.querySelector(".cs-boons"), boons, "boons");
  wire(root.querySelector(".cs-mods"), mod, "mod");
  boons.addEventListener("input", paint);
  mod.addEventListener("input", paint);
  paint();

  app.setPosition({ height: "auto" });
});
