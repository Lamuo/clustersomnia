/**
 * Extract / compile the compendium packs declared in module.json.
 *
 *   node tools/packs.mjs extract   packs/<name>      ->  src/packs/<name>   (YAML, foldered)
 *   node tools/packs.mjs compile   src/packs/<name>  ->  packs/<name>       (LevelDB)
 *
 * `src/packs/` is the source of truth; `packs/` is a build output that Foundry loads.
 * Close Foundry (or at least the world) before compiling, and reload the world after.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as YAML from "js-yaml";
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ROOT = path.join(ROOT, "src", "packs");
const FOLDER_FILE = "_Folder.yml";

/** Foundry document type -> LevelDB sublevel used in `_key`. */
const COLLECTIONS = { Item: "items", Actor: "actors" };

/* -------------------------------------------- */

/** The packs declared in module.json. `packs/immagini` is loose artwork and is deliberately not listed there. */
function declaredPacks() {
  const module = JSON.parse(fs.readFileSync(path.join(ROOT, "module.json"), "utf8"));
  return module.packs.map(p => ({ name: p.name, path: p.path, type: p.type }));
}

/* -------------------------------------------- */

async function extract() {
  for ( const pack of declaredPacks() ) {
    const src = path.join(ROOT, pack.path);
    const dest = path.join(SRC_ROOT, pack.name);
    if ( !fs.existsSync(src) ) {
      console.warn(`skip ${pack.name}: ${pack.path} does not exist`);
      continue;
    }
    await extractPack(src, dest, { yaml: true, folders: true, clean: true });
    console.log(`extracted ${pack.name} -> ${path.relative(ROOT, dest)} (${countDocs(dest)} documents)`);
  }
}

/* -------------------------------------------- */

async function compile() {
  for ( const pack of declaredPacks() ) {
    const src = path.join(SRC_ROOT, pack.name);
    const dest = path.join(ROOT, pack.path);
    if ( !fs.existsSync(src) ) {
      console.warn(`skip ${pack.name}: ${path.relative(ROOT, src)} does not exist - run \`npm run packs:extract\` first`);
      continue;
    }
    // The on-disk layout is the thing a human edits, so make the documents agree with it before packing.
    const fixed = reconcile(src, pack);
    if ( fixed ) console.log(`  reconciled ${fixed} document(s) in ${pack.name} against their directory`);
    await compilePack(src, dest, { yaml: true, recursive: true });
    console.log(`compiled ${pack.name} -> ${pack.path}`);
  }
}

/* -------------------------------------------- */

/**
 * Make each document's `folder` field match the directory it actually sits in, and its `_key` match its `_id`.
 *
 * compilePack reads `folder` and `_key` straight out of the YAML and ignores where the file lives, so without this
 * step moving a file between directories would be a no-op and the move would silently not reach Foundry.
 * Rewrites happen in place so the change is visible in `git diff` rather than only inside the binary pack.
 * @param {string} root                                  The pack's source directory.
 * @param {{name: string, type: string}} pack            The pack declaration from module.json.
 * @returns {number}                                     How many files were rewritten.
 */
function reconcile(root, pack) {
  const collection = COLLECTIONS[pack.type];
  if ( !collection ) throw new Error(`Unsupported pack type '${pack.type}' for pack '${pack.name}'.`);
  let fixed = 0;

  const walk = (dir, parentFolderId) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // This directory's own folder id comes from its _Folder.yml; the pack root has none.
    let folderId = null;
    const self = entries.find(e => e.isFile() && (e.name === FOLDER_FILE));
    if ( self ) {
      const doc = read(path.join(dir, FOLDER_FILE));
      folderId = doc._id;
      // A folder's `folder` is its *parent* folder.
      fixed += write(path.join(dir, FOLDER_FILE), doc, parentFolderId ?? null, "folders");
    }

    for ( const entry of entries ) {
      const full = path.join(dir, entry.name);
      if ( entry.isDirectory() ) {
        walk(full, folderId);
        continue;
      }
      if ( !entry.isFile() || (entry.name === FOLDER_FILE) || !isYaml(entry.name) ) continue;
      fixed += write(full, read(full), folderId, collection);
    }
  };

  walk(root, null);
  return fixed;
}

/* -------------------------------------------- */

/**
 * Rewrite a document if its `folder` or `_key` disagrees with where it lives.
 * @param {string} file            Path to the source file.
 * @param {object} doc             The parsed document.
 * @param {string|null} folderId   The folder id the document should carry.
 * @param {string} collection      The LevelDB sublevel the `_key` should use.
 * @returns {number}               1 if the file was rewritten, otherwise 0.
 */
function write(file, doc, folderId, collection) {
  const key = `!${collection}!${doc._id}`;
  if ( (doc.folder === folderId) && (doc._key === key) ) return 0;
  if ( !doc._id ) throw new Error(`${path.relative(ROOT, file)} has no _id.`);
  doc.folder = folderId;
  doc._key = key;
  fs.writeFileSync(file, YAML.dump(doc));
  console.log(`  ${path.relative(ROOT, file)}: folder -> ${folderId ?? "(root)"}`);
  return 1;
}

/* -------------------------------------------- */

function read(file) {
  return YAML.load(fs.readFileSync(file, "utf8"));
}

function isYaml(name) {
  const ext = path.extname(name);
  return (ext === ".yml") || (ext === ".yaml");
}

function countDocs(dir) {
  let n = 0;
  for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
    if ( entry.isDirectory() ) n += countDocs(path.join(dir, entry.name));
    else if ( entry.isFile() && isYaml(entry.name) ) n++;
  }
  return n;
}

/* -------------------------------------------- */

const [command] = process.argv.slice(2);
if ( command === "extract" ) await extract();
else if ( command === "compile" ) await compile();
else {
  console.error("Usage: node tools/packs.mjs <extract|compile>");
  process.exit(1);
}
