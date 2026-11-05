const FLAG_NAMESPACE = "clustersomnia";

// Index fields that can be filtered on, besides the document type. Only shown when
// at least one entry of the pack has a value for it (so spell-only fields stay off
// the talent pack).
const SELECT_FIELDS = [
  {key: "type", path: "type", label: "Type"},
  {key: "tradition", path: "system.tradition", label: "Tradition"},
  {key: "rank", path: "system.rank", label: "Rank"}
];
const DESCRIPTION_PATH = "system.description";

// Per-window filter state, kept across re-renders (the compendium re-renders on every edit).
const states = new WeakMap();

const stateOf = app => {
  if (!states.has(app)) states.set(app, {values: {}, text: "", inDescription: false});
  return states.get(app);
};

const valueAt = (entry, path) => foundry.utils.getProperty(entry, path);

function isOwnPack(pack) {
  return pack?.metadata.packageName === FLAG_NAMESPACE;
}

function buildOptions(pack, field) {
  const values = new Set();
  for (const entry of pack.index) {
    const value = valueAt(entry, field.path);
    if (value !== undefined && value !== null && value !== "") values.add(String(value));
  }
  return [...values].sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
}

function matches(entry, state) {
  for (const field of SELECT_FIELDS) {
    const wanted = state.values[field.key];
    if (wanted && String(valueAt(entry, field.path) ?? "") !== wanted) return false;
  }
  if (state.text) {
    const haystack = state.inDescription
      ? `${entry.name} ${valueAt(entry, DESCRIPTION_PATH) ?? ""}`
      : entry.name;
    if (!haystack.toLowerCase().includes(state.text)) return false;
  }
  return true;
}

function applyFilters(app, root) {
  const state = stateOf(app);
  const active = Object.values(state.values).some(Boolean) || state.text;
  const entries = root.querySelectorAll("li.directory-item.document[data-document-id]");
  let shown = 0;
  for (const li of entries) {
    const entry = app.collection.index.get(li.dataset.documentId);
    const visible = !active || (entry && matches(entry, state));
    li.classList.toggle("clustersomnia-filtered", !visible);
    // Foundry's own name search hides non-matching names inline; undo that for entries
    // that only match through their description.
    if (visible && state.inDescription && state.text) li.style.display = "";
    if (visible) shown++;
  }

  // Hide folders left with no visible entry (deepest first, so nesting resolves).
  const folders = [...root.querySelectorAll("li.directory-item.folder")].reverse();
  for (const folder of folders) {
    const hasVisible = !!folder.querySelector("li.directory-item.document:not(.clustersomnia-filtered)");
    folder.classList.toggle("clustersomnia-filtered", active && !hasVisible);
    if (active && hasVisible) folder.classList.remove("collapsed");
  }

  const counter = root.querySelector(".clustersomnia-filter-count");
  if (counter) counter.textContent = active ? `${shown} / ${entries.length}` : "";
}

async function ensureDescriptions(pack) {
  const first = pack.index.contents[0];
  if (first && valueAt(first, DESCRIPTION_PATH) !== undefined) return;
  await pack.getIndex({fields: [DESCRIPTION_PATH]});
}

// Fraction of the browser's wheel step used inside the open list. A native <select>
// popup scrolls at the OS's speed (too fast with dozens of options) and can't be
// tuned, hence the custom dropdown.
const LIST_WHEEL_FACTOR = 0.35;
const LIST_SEARCH_THRESHOLD = 10;

let closeOpenDropdown = null;

/**
 * Button + popup list standing in for a <select>. The popup is attached to <body>
 * (the compendium window clips its overflow) and positioned from the button.
 */
function createDropdown(field, options, current, onChange) {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("clustersomnia-dropdown");
  button.dataset.filter = field.key;

  const setValue = value => {
    current = value;
    button.textContent = `${field.label}: ${value || "all"}`;
    button.classList.toggle("active", !!value);
  };
  setValue(current);

  button.addEventListener("click", () => {
    if (closeOpenDropdown) {
      const wasOwn = button.classList.contains("open");
      closeOpenDropdown();
      if (wasOwn) return;
    }

    const popup = document.createElement("div");
    popup.classList.add("clustersomnia-dropdown-popup");
    const rect = button.getBoundingClientRect();
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.bottom + 2}px`;
    popup.style.minWidth = `${rect.width}px`;
    popup.style.maxHeight = `${Math.max(120, Math.min(260, window.innerHeight - rect.bottom - 16))}px`;

    const list = document.createElement("div");
    list.classList.add("clustersomnia-dropdown-list");
    const items = [{value: "", text: "all"}, ...options.map(o => ({value: o, text: o}))].map(({value, text}) => {
      const item = document.createElement("div");
      item.classList.add("clustersomnia-dropdown-item");
      item.classList.toggle("selected", value === current);
      item.textContent = text;
      item.addEventListener("click", () => {
        setValue(value);
        onChange(value);
        close();
      });
      list.append(item);
      return item;
    });

    if (options.length > LIST_SEARCH_THRESHOLD) {
      const search = document.createElement("input");
      search.type = "search";
      search.placeholder = `Find ${field.label.toLowerCase()}...`;
      search.addEventListener("input", () => {
        const needle = search.value.trim().toLowerCase();
        for (const item of items) item.hidden = !!needle && !item.textContent.toLowerCase().includes(needle);
      });
      popup.append(search);
      queueMicrotask(() => search.focus());
    }
    popup.append(list);

    list.addEventListener("wheel", event => {
      event.preventDefault();
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 40 : event.deltaY;
      list.scrollTop += delta * LIST_WHEEL_FACTOR;
    }, {passive: false});

    const onOutside = event => {
      if (!popup.contains(event.target) && event.target !== button) close();
    };
    const onKey = event => {
      if (event.key === "Escape") close();
    };
    function close() {
      popup.remove();
      button.classList.remove("open");
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onKey, true);
      closeOpenDropdown = null;
    }
    closeOpenDropdown = close;
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);

    button.classList.add("open");
    document.body.append(popup);
    list.querySelector(".selected")?.scrollIntoView({block: "nearest"});
  });

  return button;
}

// The default pack index only carries name/type: pull in the filterable system fields
// once, before the first window renders.
Hooks.once("ready", async () => {
  const fields = SELECT_FIELDS.map(f => f.path).filter(path => path !== "type");
  for (const pack of game.packs) {
    if (isOwnPack(pack)) await pack.getIndex({fields});
  }
});

Hooks.on("renderCompendium", (app, html) => {
  const pack = app.collection;
  if (!isOwnPack(pack)) return;
  const root = html instanceof HTMLElement ? html : html[0];
  const state = stateOf(app);

  const bar = document.createElement("div");
  bar.classList.add("clustersomnia-filters", "flexrow");

  for (const field of SELECT_FIELDS) {
    const options = buildOptions(pack, field);
    // The type filter is pointless when the pack holds a single type.
    if (options.length < (field.key === "type" ? 2 : 1)) continue;
    bar.append(createDropdown(field, options, state.values[field.key] ?? "", value => {
      state.values[field.key] = value;
      applyFilters(app, root);
    }));
  }

  const label = document.createElement("label");
  label.classList.add("clustersomnia-filter-desc");
  label.title = "Search the description too";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.inDescription;
  label.append(checkbox, " Text");
  bar.append(label);

  const counter = document.createElement("span");
  counter.classList.add("clustersomnia-filter-count");
  bar.append(counter);

  // Foundry's own name search keeps working (and combines with these filters via
  // the class toggle); the description checkbox widens it to the body text.
  const search = root.querySelector(".header-search input[name='search']");
  const onSearch = async () => {
    state.text = (search?.value ?? "").trim().toLowerCase();
    if (state.inDescription && state.text) await ensureDescriptions(pack);
    applyFilters(app, root);
  };
  checkbox.addEventListener("change", () => {
    state.inDescription = checkbox.checked;
    onSearch();
  });
  search?.addEventListener("input", onSearch);

  root.querySelector(".header-search")?.after(bar);
  if (search) state.text = search.value.trim().toLowerCase();
  applyFilters(app, root);
});
