const MODULE_ID = "clustersomnia";

// The system answers every health change with `handleHealthChange`, which adds or removes the Injured and
// Incapacitated effects through `findAddEffect` ("is there none? then create it") and `findDeleteEffect` ("find it,
// then delete it"). Both look first and act after an await, and handleHealthChange itself updates the actor again (the
// `injured` flag), which starts it once more before it has finished. Overlapping runs therefore both create the same
// effect (two Injured on one PG) or both delete it ("ActiveEffect ... does not exist"). Here the handler runs one at a
// time per actor, and calls that arrive while it runs are merged into a single extra pass: it only syncs the effects
// with the current health, so repeating it once at the end is enough.
Hooks.once("ready", () => {
  const proto = CONFIG.Actor.documentClass.prototype;
  const original = proto.handleHealthChange;
  if (typeof original !== "function") return console.warn(`${MODULE_ID} | handleHealthChange not found: health guard is off`);

  const states = new WeakMap();

  proto.handleHealthChange = function (...args) {
    const state = states.get(this) ?? { busy: false, again: false };
    states.set(this, state);
    // Already running: ask for another pass when it is done. The caller is not made to wait (the nested update the
    // handler makes itself would otherwise wait on the handler that is waiting on it).
    if (state.busy) {
      state.again = true;
      return Promise.resolve();
    }
    state.busy = true;
    return (async () => {
      try {
        do {
          state.again = false;
          await original.apply(this, args);
        } while (state.again);
      } finally {
        state.busy = false;
      }
    })();
  };
});
