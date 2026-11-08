import { MODULE_ID, genesisActor, styleProfile, alsaSetting } from "./alsa-data.js";

// On the Genesis actor's sheet, the weapons list shows only the unarmed attack of the form she is in: the punch in
// human form, the cat claws in cat form, the hybrid claws in hybrid form. The other two are hidden, not removed (the
// items stay on the actor). A small eye button in the header of the weapons list turns this on and off; the choice
// is kept in a flag on the actor. The other weapons are always shown.

const FLAG = "alsaFormWeapons";

const formWeaponNames = () => [
  alsaSetting("styleWeapon") || "Pugno",
  alsaSetting("styleCatWeapon") || "Artigli (Gatto)",
  alsaSetting("styleHybridWeapon") || "Artigli (Ibrido)"
].map(name => name.trim().toLowerCase());

/** On unless the actor has it turned off. */
const filterOn = actor => actor.getFlag(MODULE_ID, FLAG) !== false;

Hooks.on("renderActorSheet", (sheet, html) => {
  const actor = sheet.actor;
  if (!actor || actor.id !== genesisActor()?.id) return;
  const root = html[0] ?? html;
  const tab = root.querySelector?.('.tab.combat, .tab[data-tab="combat"]');
  const header = tab?.querySelector(".dl-item-row-header");
  if (!header || header.querySelector(".cs-form-toggle")) return;

  const on = filterOn(actor);

  // The button sits before the "+" of the weapons header.
  const add = header.querySelector(".item-create");
  if (add && actor.isOwner) {
    const button = document.createElement("a");
    button.className = `cs-form-toggle${on ? " cs-active" : ""}`;
    button.setAttribute("role", "switch");
    button.setAttribute("aria-checked", String(on));
    button.title = on
      ? "Mostra solo l'attacco a mani nude della forma attuale (clic: mostra tutti)"
      : "Mostra tutti gli attacchi a mani nude (clic: solo quello della forma attuale)";
    button.innerHTML = `<i class="fas ${on ? "fa-eye-slash" : "fa-eye"}"></i>`;
    button.addEventListener("click", event => {
      event.preventDefault();
      actor.setFlag(MODULE_ID, FLAG, !on);
    });
    add.before(button);
  }

  if (!on) return;
  const names = formWeaponNames();
  for (const row of tab.querySelectorAll(".dl-item-row[data-item-id]")) {
    const item = actor.items.get(row.dataset.itemId);
    if (item?.type !== "weapon" || !names.includes(item.name.trim().toLowerCase())) continue;
    // Shown only if this weapon is the one of the form she is in now.
    if (!styleProfile(actor, item)) row.style.display = "none";
  }
});
