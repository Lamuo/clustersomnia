// Temporary hit points / shield, for every actor. The system's data model has no field for it (and drops unknown
// keys), so the value lives in the actor flag clustersomnia.tempHp. It is shown on the actor sheet, on the party
// cards (union-meter.js), in the Tracker and on token bars. It is only a number the table edits: damage does not
// consume it by itself.

const MODULE_ID = "clustersomnia";
const FLAG = "tempHp";
const SHIELD_COLOR = 0x5ec8f5;

/** Current temporary HP of an actor (0 when none). Unlinked tokens keep their own value on the token's actor. */
export function tempHp(actor) {
  const value = Number(actor?.getFlag(MODULE_ID, FLAG));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function setTempHp(actor, value) {
  const next = Math.max(0, Math.floor(Number(value)) || 0);
  return next ? actor.setFlag(MODULE_ID, FLAG, next) : actor.unsetFlag(MODULE_ID, FLAG);
}

/* ------------------------------- Damage ------------------------------- */

// Damage that raises health.value (the damage taken) is taken off the temporary HP first, whoever writes it: the
// party cards, the Tracker, the sheet, the chat buttons. Healing lowers health.value and leaves the shield alone.
// The party cards take it off themselves (to draw it at once) and say so with options.csTempHandled.
const HEALTH_PATH = "system.characteristics.health.value";

Hooks.on("preUpdateActor", (actor, changes, options) => {
  if (options.csTempHandled) return;
  const flat = HEALTH_PATH in changes;
  const next = flat ? changes[HEALTH_PATH] : foundry.utils.getProperty(changes, HEALTH_PATH);
  if (next === undefined) return;
  const temp = tempHp(actor);
  const raise = Number(next) - Number(actor.system.characteristics.health.value);
  if (!temp || !(raise > 0)) return;

  const absorbed = Math.min(temp, raise);
  if (flat) changes[HEALTH_PATH] = Number(next) - absorbed;
  else foundry.utils.setProperty(changes, HEALTH_PATH, Number(next) - absorbed);
  const left = temp - absorbed;
  if (left) foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${FLAG}`, left);
  else foundry.utils.setProperty(changes, `flags.${MODULE_ID}.-=${FLAG}`, null);
});

/* ------------------------------ Actor sheet ------------------------------ */

function tempBox(actor) {
  const title = Handlebars.Utils.escapeExpression(game.i18n.localize("CLUSTERSOMNIA.TempHpFull"));
  const label = Handlebars.Utils.escapeExpression(game.i18n.localize("CLUSTERSOMNIA.TempHp"));
  const disabled = actor.isOwner ? "" : "disabled";
  return `<div class="speedbox cs-temphp" title="${title}">
    <div class="speedtext">${label}</div>
    <div class="speed"><input type="number" min="0" value="${tempHp(actor)}" ${disabled}></div>
  </div>`;
}

Hooks.on("renderActorSheet", (app, html) => {
  const root = html[0] ?? html;
  const actor = app.actor ?? app.document;
  if (!actor || root.querySelector(".cs-temphp")) return;

  // Character sheet: the empty cell beside Fabula. Creature sheet: a new row under the size / speed row.
  const fortune = root.querySelector(".spendFortune")?.closest(".chars");
  let placed = false;
  const empty = fortune && [...fortune.children].find(child => !child.children.length && !child.textContent.trim());
  if (empty) {
    empty.replaceWith(Object.assign(document.createElement("div"), { innerHTML: tempBox(actor) }).firstElementChild);
    placed = true;
  } else {
    const speedRow = root.querySelector('input[name="system.characteristics.speed"]')?.closest(".chars");
    if (speedRow) {
      speedRow.insertAdjacentHTML("afterend", `<div class="chars grid grid-2">${tempBox(actor)}<div></div></div>`);
      placed = true;
    }
  }
  if (!placed) return;

  const input = root.querySelector(".cs-temphp input");
  input.addEventListener("change", event => {
    event.stopPropagation();
    setTempHp(actor, input.value);
  });
});

/* ------------------------------- Token bar ------------------------------- */

/** The system's own bar grows with damage, so the shield sits at the other end: the part that still stands. */
function drawShield(token, bar, data) {
  const temp = tempHp(token.actor);
  if (!temp || !data?.max) return;
  const w = token.w;
  let h = Math.max(canvas.dimensions.size / 12, 8);
  if (token.document.height >= 2) h *= 1.6;
  const stroke = Math.clamp(h / 8, 1, 2);
  const width = Math.min(1, temp / data.max) * w;
  bar
    .beginFill(SHIELD_COLOR, 0.95)
    .lineStyle(stroke, token.blk, 1.0)
    .drawRoundedRect(w - width, 0, width, h, 2)
    .endFill();
  drawHoneycomb(bar, w - width, w, h);
}

/**
 * Honeycomb outlines over the shield: pointy-top hexagons that run on past the top and bottom edges. Each edge is
 * cut at the rectangle (Liang-Barsky), so a hexagon half outside is drawn half, not squashed.
 */
function drawHoneycomb(bar, x0, x1, h) {
  const r = Math.max(2.5, h * 0.3);
  const dx = Math.sqrt(3) * r;
  const dy = 1.5 * r;
  bar.lineStyle(1, 0xffffff, 0.6);
  // Rows are centred on the bar so the pattern is the same above and below the middle.
  const rows = Math.ceil(h / dy) + 2;
  for (let row = -rows; row <= rows; row++) {
    const cy = h / 2 + row * dy;
    for (let cx = x0 + (row % 2 ? dx / 2 : 0) - dx; cx - dx < x1; cx += dx) {
      const corners = [0, 1, 2, 3, 4, 5].map(k => {
        const angle = Math.PI / 6 + (Math.PI / 3) * k;
        return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
      });
      for (let k = 0; k < 6; k++) {
        const segment = clipSegment(corners[k], corners[(k + 1) % 6], x0, 0, x1, h);
        if (segment) bar.moveTo(segment[0], segment[1]).lineTo(segment[2], segment[3]);
      }
    }
  }
}

/** The part of segment a-b inside the rectangle, or null. */
function clipSegment([ax, ay], [bx, by], left, top, right, bottom) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [[-dx, ax - left], [dx, right - ax], [-dy, ay - top], [dy, bottom - ay]]) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  if (t0 > t1) return null;
  return [ax + t0 * dx, ay + t0 * dy, ax + t1 * dx, ay + t1 * dy];
}

Hooks.once("ready", () => {
  const proto = CONFIG.Token.objectClass?.prototype;
  const original = proto?._drawDamageBar;
  if (typeof original !== "function") {
    console.warn(`${MODULE_ID} | The system no longer has Token#_drawDamageBar: temporary HP are not drawn on token bars.`);
    return;
  }
  proto._drawDamageBar = function (number, bar, data) {
    const result = original.call(this, number, bar, data);
    drawShield(this, bar, data);
    return result;
  };
});

Hooks.on("updateActor", (actor, changes) => {
  if (!foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.${FLAG}`) && !foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.-=${FLAG}`)) return;
  for (const token of actor.getActiveTokens()) token.renderFlags.set({ refreshBars: true });
});
