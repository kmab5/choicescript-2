/*
 * bus.js — the single source of UI state.
 *
 * Plain data only. Knows nothing about the DOM and nothing about the engine.
 * bridge.js writes to it; app.js reads from it.
 *
 * Shape:
 *   blocks   array of rendered items on the current screen
 *   pending  what the engine is waiting for, or null while it is still running
 *   loading  true while a scene file is being fetched
 *   modal    { kind: "alert"|"confirm", message, resume }
 *   history  previous screens this session (for the history drawer)
 *   screen   "game" | "stats" | "saves" | "settings" | "achievements"
 *
 * Block kinds:
 *   { kind: "text",      html }
 *   { kind: "linebreak" }
 *   { kind: "image",     source, alignment, alt, invert }
 *   { kind: "youtube",   slug }
 *   { kind: "statchart", rows }
 *   { kind: "link",      href, anchorText }
 *   { kind: "node",      el }        raw DOM node from a legacy *script block
 *
 * Pending kinds:
 *   { kind: "choice",     groups, options, resume }
 *   { kind: "next",       name, resume }
 *   { kind: "input",      inputType, name, minimum, maximum, step, resume }
 *   { kind: "checkboxes", options, submitName, resume }
 */

var bus = {
  blocks: [],
  pending: null,
  loading: false,
  modal: null,
  history: [],
  screen: 'game',
};

var busSubscribers = [];

function busSubscribe(fn) {
  busSubscribers.push(fn);
  return function busUnsubscribe() {
    var i = busSubscribers.indexOf(fn);
    if (i !== -1) busSubscribers.splice(i, 1);
  };
}

function busNotify() {
  for (var i = 0; i < busSubscribers.length; i++) {
    busSubscribers[i](bus);
  }
}

function busSet(patch) {
  for (var key in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) bus[key] = patch[key];
  }
  busNotify();
}

function busPush(block) {
  bus.blocks.push(block);
  busNotify();
}

/* Archive the current screen and start a fresh one. */
function busAdvance() {
  if (bus.blocks.length) bus.history.push(bus.blocks);
  bus.blocks = [];
  bus.pending = null;
  busNotify();
}

function busReset() {
  bus.blocks = [];
  bus.pending = null;
  bus.loading = false;
  bus.modal = null;
  bus.history = [];
  bus.screen = 'game';
  busNotify();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { bus: bus, busSet: busSet, busPush: busPush,
    busAdvance: busAdvance, busReset: busReset, busSubscribe: busSubscribe };
}
