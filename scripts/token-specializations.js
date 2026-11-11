import { glyphOf, specializationsOf } from "./tags.js";

// The specializations of an actor drawn on its token as small round badges, in the corner like the status icons.
// Only what was assigned by hand shows (`auto: false`): a monster's highest attribute says nothing about it.
// Everything is a child of the token, so it moves, scales, hides and is destroyed with it.

const NAME = "clustersomnia-specializations";

function sync(token) {
  const list = token.actor ? specializationsOf(token.actor, { auto: false }) : [];
  let box = token.children.find(child => child.name === NAME && !child.destroyed);
  // A third of the token, narrower when there are many so the row stays inside it, never below a readable minimum.
  const size = Math.max(18, Math.min(token.w / 3, token.w / Math.max(list.length, 1) - 2));
  // The look of each entry is in the key, so editing an icon or a colour in the library redraws the badge.
  const key = `${size}|${list.map(entry => `${entry.id}:${entry.icon}:${entry.color}`).join(",")}`;
  if (!list.length) {
    box?.destroy({ children: true });
    return;
  }
  if (box?.key === key) return;
  box?.destroy({ children: true });
  box = new PIXI.Container();
  box.name = NAME;
  box.key = key;
  box.eventMode = "none";
  list.forEach((entry, index) => {
    const radius = size / 2;
    const badge = new PIXI.Container();
    badge.position.set(radius + 2 + index * (size + 2), radius + 2);
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
      glyph.anchor.set(0.5);
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
