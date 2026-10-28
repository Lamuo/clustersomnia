# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **Foundry VTT v12 module** (`id: clustersomnia`) for the *Shadow of the Demon Lord* (`demonlord`) system. Two concerns in one module:

1. **Compendium packs** (`packs/`) — LevelDB stores for Spells, Paths, Ancestries, Party (Actors), Items, Languages and Professions, Features and Talents. Declared in `module.json`.
2. **SotDL Tracker** (`scripts/`, `templates/`, `styles/`) — a per-actor HP / custom-counter / active-effect panel opened from the Token HUD.

There is no build step, no package manager, no tests, no bundler. `scripts/*.js` are plain ES modules loaded directly by Foundry (`esmodules` in `module.json`), and paths inside the code are absolute Foundry-relative URLs (`modules/clustersomnia/templates/tracker.hbs`) — the folder must be installed/symlinked as `Data/modules/clustersomnia`.

## Development loop

Edit files → in Foundry, reload the world (F5) to pick up JS/HBS/CSS changes. Bumping `version` in `module.json` matters only for distribution, not local iteration. Verify changes in a running world; there is nothing to lint or compile.

## Architecture

- `scripts/module.js` — the only entry point. Registers the `renderTokenHUD` hook that injects the tracker button, plus a one-time `ready` migration.
- `scripts/tracker-app.js` — `TrackerApp`, the main panel.
- `scripts/effects-config-app.js` — `EffectsConfigApp`, the checkbox list choosing which of the actor's applicable effects the tracker shows.
- `scripts/persistence.js` — the two non-obvious helpers both apps depend on; read this first.

Both apps are **ApplicationV2 + HandlebarsApplicationMixin** (`foundry.applications.api`), not the legacy `Application`/`FormApplication`. Consequences to respect when editing:

- Click handlers are declared in `static DEFAULT_OPTIONS.actions` and implemented as `static #private` methods, invoked with `this` bound to the app instance and signature `(event, target)`. Templates wire them with `data-action="<name>"`.
- Templates are declared in `static PARTS`; context comes from `async _prepareContext()`.
- Anything not expressible as an action (the counter name/max text inputs) is wired manually in `_onRender` via `this.element.querySelectorAll(...)`.

`TrackerApp` keeps itself live by registering Foundry hooks (`updateActor`, `create/update/deleteActiveEffect`, `create/deleteItem`) in `_onRender` and storing their ids on `this._hooks`; `_onClose` unregisters them. The `??=` guard means they are registered once per app instance, not per re-render — **any new hook must be added to that array and will be cleaned up automatically; registering outside it leaks a listener per window.**

## Unity meter (per-PG "punti unione")

`scripts/unity-meter.js` draws a fixed on-screen stack of JRPG gauges, one per PC (character actors with a player owner), as plain DOM `#clustersomnia-unity` (not an Application). Beside each bar sit the portraits of PCs *ready* for a union move with it: both PGs have >= the pair's cost and the pair isn't in `used` yet. Clicking a portrait spends the cost from both and marks the pair used (A+B == B+A, key = sorted ids joined by `|`).

A PG's points are the uses of its **"Punti Unione" talent** item (`system.uses.value`, max = `system.uses.max`, fallback 5), so the sheet and the meter always agree; PCs without that talent don't get a bar. The pairs already used this fight are the only module-owned state: world setting `unityState` `{used:[pairKey]}`, plus `unityCosts` (per-pair overrides of `unityDefaultCost`, edited in `UnityConfigApp`). Only the active GM writes: Trusted+ clients emit `{type:"unity-op"}` on the module socket (ops: `delta`, `use`; `resetUsed` is GM-only) and the GM applies them serially in `applyOperation`, updating the talent items directly. Item create/update/delete hooks on that talent redraw the meter. `used` is cleared on `deleteCombat`.

Skins live in `skins/<name>/` (`skin.json` + frame/fill images) or in any user folder set in `unitySkinFolder`. The fill image is revealed with a slanted `clip-path` driven by `track.x0/x1/slant` (percent of the artwork); see `skins/persona/skin.json` for every supported key. Preset choices are hardcoded in `PRESET_SKINS`.

## Persistence rules (easy to get wrong)

- Flag namespace is `"clustersomnia"`, hardcoded as `FLAG_NAMESPACE` in each script. `"my-tracker"` is the **legacy** namespace from a now-deleted standalone module; `module.js` migrates leftover `counters` / `displayedEffectIds` off it once, GM-only, on `ready`. Do not write to the legacy namespace.
- `persistenceActor(actor)` from `persistence.js` resolves an unlinked token's synthetic actor to its world `baseActor`. Effect-selection flags **must** go through it, otherwise they are written into scene token data and vanish with the token. (Note the asymmetry: `counters` are currently stored on `this.actor` directly, while `displayedEffectIds` uses `persistenceActor`.)
- `effectKey(effect)` produces a scene-independent effect id (`Item.<id>.ActiveEffect.<id>` or `ActiveEffect.<id>`). Never persist `effect.uuid` for token actors — it embeds scene and token ids and will not match elsewhere. Reads still accept raw uuids for backwards compatibility with older saved data.

## Compendium packs

`packs/*` are binary LevelDB directories (`.ldb`, `MANIFEST-*`, `CURRENT`), marked `binary` in `.gitattributes` — never diffable, and merge conflicts there cannot be resolved by hand. **They are a build output.** The source of truth is `src/packs/`: one YAML file per document, laid out in directories mirroring the compendium's folder tree (`_Folder.yml` describes each folder). Both are committed, because Foundry loads `packs/`.

```
npm install               # once
npm run packs:extract     # packs/  -> src/packs/   (after editing in Foundry's UI)
npm run packs:compile     # src/packs/ -> packs/    (after editing the YAML by hand)
```

`tools/packs.mjs` drives both directions via `@foundryvtt/foundryvtt-cli`, iterating the pack list in `module.json` (so a new pack needs no tooling change). Either editing route is valid — Foundry's compendium UI or the YAML — but **the two must not be edited concurrently**: whichever direction you run last overwrites the other side. Round-tripping is lossless (verified: extract → compile → extract is byte-identical).

Editing the YAML:

- **Never change `_id`.** Item and folder ids back every pack UUID, actor link and effect key; changing one silently breaks references.
- **Move an item or a folder by moving its file/directory.** `compilePack` itself only reads the `folder` field and ignores file location, so `tools/packs.mjs compile` runs a reconcile pass first that rewrites each document's `folder` (and `_key`) to match the directory it sits in. It logs every document it fixes, and the change lands in `src/packs/` so it shows up in `git diff`.
- Renaming a *directory* does nothing — a folder's display name is the `name` field in its `_Folder.yml`. Rename there; the next `packs:extract` renames the directory to match.
- A new folder is a new directory containing a `_Folder.yml` with a fresh 16-char alphanumeric `_id`, `_key: "!folders!<id>"`, `name`, `type` matching the pack's document type, and `sorting`/`sort`. Order within a folder is the integer `sort`.

Pack ownership is `PLAYER: OBSERVER`, `TRUSTED: OWNER`, `ASSISTANT: OWNER`. **Trusted Player is the deliberate content-builder role** — trusted users may create, edit and delete pack contents, plain players may only read and import. Ownership is pack-wide (folders carry no `ownership` field), so a trusted user can edit any document in a pack, including canonical content. Note that a GM who configures ownership for a pack inside the world overrides this block; the world's value wins.

Operational notes:

- **Close Foundry (or at least the world) before running either script**, and reload the world after a compile. Both directions open the LevelDB store; `extract` is logically read-only but still triggers LevelDB log recovery, so it rewrites `.log`/`MANIFEST-*` files and dirties `packs/` in git even when no data changed.
- Foundry regenerates `LOCK`, `LOG`, `LOG.old` on every open; these are gitignored.
- `packs/immagini/` is loose artwork and is deliberately **not** declared in `module.json`, so the tooling skips it. Two real pack directories also contain stray images (`packs/ancestries/536px-Concept_Viera.jpg`, `packs/items/Super Gattos.jpg`) — compile writes into the existing directory rather than replacing it, so these survive. Never `rm -rf` a pack directory.
