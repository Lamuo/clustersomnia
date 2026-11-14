import { glyphOf, specializationsOf } from "./tags.js";

// The specializations of an actor drawn on its token as small round badges, in the corner like the status icons.
// Only what was assigned by hand shows (`auto: false`): a monster's highest attribute says nothing about it.
// Everything is a child of the token, so it moves, scales, hides and is destroyed with it.

const NAME = "clustersomnia-specializations";

let tip = null;

function moveTip(event) {
  if (!tip) return;
  const x = event.clientX ?? event.global?.x ?? 0;
  const y = event.clientY ?? event.global?.y ?? 0;
  tip.style.left = `${Math.min(x + 14, window.innerWidth - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.min(y + 14, window.innerHeight - tip.offsetHeight - 8)}px`;
}

function showTip(name, text, event) {
  hideTip();
  tip = document.createElement("div");
  tip.style.cssText = "position:fixed;z-index:10000;pointer-events:none;max-width:260px;padding:6px 9px;border-radius:5px;"
    + "background:rgba(10,10,14,.94);border:1px solid #666;color:#eee;font-size:12px;line-height:1.35;box-shadow:0 2px 8px #000a;";
  const title = document.createElement("strong");
  title.textContent = name;
  title.style.display = "block";
  tip.append(title);
  if (text) tip.append(document.createTextNode(text));
  document.body.append(tip);
  moveTip(event);
}

function hideTip() {
  tip?.remove();
  tip = null;
}

const fileOf = value => String(value ?? "").split("?")[0].split("/").pop();

// Foundry draws each status as a sprite in `token.effects` (after a background Graphics) and gives it no hover. Each sprite
// is matched to its effect by the picture; the listeners are added once per sprite and read the effect from `sprite.cuEffect`.
function syncStatusTips(token) {
  const effects = token.actor?.temporaryEffects ?? [];
  const pool = [...effects];
  for (const sprite of token.effects?.children ?? []) {
    if (!(sprite instanceof PIXI.Sprite) || sprite.destroyed) continue;
    const file = fileOf(sprite.texture?.baseTexture?.resource?.src ?? sprite.texture?.baseTexture?.cacheId);
    const at = pool.findIndex(effect => fileOf(effect.img) === file);
    const effect = at >= 0 ? pool.splice(at, 1)[0] : null;
    sprite.cuEffect = effect;
    if (sprite.cuTip) continue;
    sprite.cuTip = true;
    sprite.eventMode = "static";
    sprite.on("pointerover", event => {
      const current = sprite.cuEffect;
      if (!current) return;
      const holder = document.createElement("div");
      holder.innerHTML = current.description ?? "";
      showTip(current.name, holder.textContent.trim().slice(0, 300), event);
    });
    sprite.on("pointermove", event => moveTip(event));
    sprite.on("pointerout", hideTip);
    sprite.on("destroyed", hideTip);
  }
}

function sync(token) {
  syncStatusTips(token);
  const list = token.actor ? specializationsOf(token.actor, { auto: false }) : [];
  let box = token.children.find(child => child.name === NAME && !child.destroyed);
  // As small as the status icons (read from one when drawn, else Foundry's own proportion), narrower if there are many.
  const icon = token.effects?.children.find(child => child.width > 0 && !child.destroyed);
  const base = Math.round(icon?.width || canvas.dimensions.size / 5);
  const size = Math.max(12, Math.min(base, token.w / Math.max(list.length, 1) - 2));
  // The look of each entry is in the key, so editing an icon or a colour in the library redraws the badge.
  const key = `${size}|${token.w}|${list.map(entry => `${entry.id}:${entry.icon}:${entry.color}`).join(",")}`;
  if (!list.length) {
    box?.destroy({ children: true });
    return;
  }
  if (box?.key === key) return;
  box?.destroy({ children: true });
  box = new PIXI.Container();
  box.name = NAME;
  box.key = key;
  box.eventMode = "passive";
  list.forEach((entry, index) => {
    const radius = size / 2;
    const badge = new PIXI.Container();
    // Top-right, growing leftwards: Foundry fills the status icons from the top-left corner.
    badge.position.set(token.w - radius - 2 - index * (size + 2), radius + 2);
    // Hover: name and short description next to the pointer.
    badge.eventMode = "static";
    badge.hitArea = new PIXI.Circle(0, 0, radius);
    const text = entry.effect || (entry.stat ? `Attributo più alto: ${entry.stat}.` : "");
    badge.on("pointerover", event => showTip(entry.name, text, event));
    badge.on("pointermove", event => moveTip(event));
    badge.on("pointerout", hideTip);
    badge.on("destroyed", hideTip);
    const disc = new PIXI.Graphics();
    disc.lineStyle(Math.max(1.5, size / 10), entry.color, 1).beginFill(0x000000, 0.75).drawCircle(0, 0, radius).endFill();
    badge.addChild(disc);
    const code = glyphOf(entry.icon);
    if (code) {
      const glyph = new PIXI.Text(code, {
        // Foundry ships FontAwesome Pro; the Free name is the fallback for a build that does not.
        fontFamily: ["Font Awesome 6 Pro", "Font Awesome 6 Free"],
        fontWeight: "900",
        fontSize: size * 0.55,
        fill: 0xffffff
      });
      // The text box has line-height and descent around the glyph, so anchoring its middle leaves the drawing off centre:
      // pivot on the middle of the ink instead (measured on a canvas), from the origin / baseline the text is laid out on.
      const family = glyph.style.fontFamily.map(name => `"${name}"`).join(",");
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = `900 ${glyph.style.fontSize}px ${family}`;
      const ink = ctx.measureText(code);
      const ascent = PIXI.TextMetrics.measureText(code, glyph.style).fontProperties.ascent;
      glyph.pivot.set(
        (ink.actualBoundingBoxRight - ink.actualBoundingBoxLeft) / 2,
        ascent + (ink.actualBoundingBoxDescent - ink.actualBoundingBoxAscent) / 2
      );
      // Rasterised at several times its size so it stays sharp when the canvas is zoomed in.
      glyph.resolution = 4;
      badge.addChild(glyph);
    }
    box.addChild(badge);
  });
  token.addChild(box);
}

/** Redraws the badges of every token on the scene (the library changed). */
export function refreshTokenSpecializations() {
  for (const token of canvas.tokens?.placeables ?? []) sync(token);
}

Hooks.on("refreshToken", token => sync(token));
Hooks.on("drawToken", token => sync(token));

// A change of the flag does not touch anything the token redraws on its own: ask the tokens of that actor to refresh.
Hooks.on("updateActor", (actor, changes) => {
  if (!foundry.utils.hasProperty(changes, "flags.clustersomnia")) return;
  // Unlinked tokens read the flag from their world actor but are not that actor's active tokens: match them by base actor.
  for (const token of canvas.tokens?.placeables ?? []) if (token.document.baseActor?.id === actor.id) sync(token);
});
