import { tempHp } from "./temp-hp.js";

// The hit point bar under the tokens, drawn like the one on the party cards. The system's own bar fills as damage is
// taken (empty = unhurt, full = dead); this one is full when the PG is unhurt and empties as it is hurt, with the same
// colour that blends from green (full) through orange (half: injured) to red (empty: dead), taken from the skin the
// cards use. The temporary HP (the shield) are drawn after the hit points that are left, in azure with a honeycomb.

const MODULE_ID = "clustersomnia";
const FLAG = "tempHp";
const SHIELD_COLOR = 0x5ec8f5;
const DEFAULT_COLORS = { ok: [0x4c, 0xc4, 0x6a], injured: [0xf0, 0xa0, 0x30], down: [0xd0, 0x3a, 0x3a] };

/** The three colours of the skin the party cards use now ([r, g, b] each), or the defaults when no card is up. */
function palette() {
  const colors = document.querySelector(".cu-host")?._hpColors;
  return { ok: colors?.ok ?? DEFAULT_COLORS.ok, injured: colors?.injured ?? DEFAULT_COLORS.injured, down: colors?.down ?? DEFAULT_COLORS.down };
}

/** The colour for a fraction of the hit points left, as a number for PIXI: down at 0, injured at half, ok at full. */
function hpColor(fraction) {
  const { ok, injured, down } = palette();
  const [from, to, t] = fraction >= 0.5 ? [injured, ok, (fraction - 0.5) * 2] : [down, injured, fraction * 2];
  const [r, g, b] = from.map((channel, index) => Math.round(channel + (to[index] - channel) * t));
  return (r << 16) | (g << 8) | b;
}

/** The bar for a token: the hit points left, then the shield. `data.value` is the damage taken, as in the system. */
function drawHpBar(token, number, bar, data) {
  const max = Number(data.max);
  const damage = Math.clamp(Number(data.value) || 0, 0, max);
  const left = max - damage;
  const temp = tempHp(token.actor);
  // The scale widens when the hit points and the shield together pass the maximum, as on the cards.
  const scale = Math.max(max, left + temp);

  // The size and position are the system's (and core's): same container, same stroke.
  const width = token.w;
  let height = Math.max(canvas.dimensions.size / 12, 8);
  if (token.document.height >= 2) height *= 1.6;
  const stroke = Math.clamp(height / 8, 1, 2);
  token._resetVitalsBar(bar, width, height, stroke);

  const fill = (left / scale) * width;
  if (left > 0) {
    bar.beginFill(hpColor(left / max), 1).lineStyle(stroke, token.blk, 1).drawRoundedRect(0, 0, fill, height, 2).endFill();
  }
  if (temp > 0) {
    const shield = (temp / scale) * width;
    bar.beginFill(SHIELD_COLOR, 0.95).lineStyle(stroke, token.blk, 1).drawRoundedRect(fill, 0, shield, height, 2).endFill();
    drawHoneycomb(bar, fill, fill + shield, height);
  }
  token._setVitalsBarPosition(bar, number, height);
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
  if (typeof original !== "function" || typeof proto._resetVitalsBar !== "function" || typeof proto._setVitalsBarPosition !== "function") {
    console.warn(`${MODULE_ID} | The system's token bar methods are not there any more: the token bars keep the system's look.`);
    return;
  }
  proto._drawDamageBar = function (number, bar, data) {
    // Without a maximum there is nothing to fill: the system draws it.
    if (!data?.max) return original.call(this, number, bar, data);
    return drawHpBar(this, number, bar, data);
  };
});

// A change of the shield does not touch the bar attribute, so the tokens of that actor are asked to redraw their bars.
Hooks.on("updateActor", (actor, changes) => {
  if (!foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.${FLAG}`) && !foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.-=${FLAG}`)) return;
  for (const token of actor.getActiveTokens()) token.renderFlags.set({ refreshBars: true });
});
