/*
 * saves.js — save slot data for *save_game / *restore_game.
 *
 * util.js already owns the storage: getSaves reads the slot list, recordSave
 * writes one, computeCookie serialises {stats, temps, lineNum, indent} and
 * restoreGame replays from it. This file only shapes that for the renderer.
 */

function savesLoad(callback) {
  if (typeof getSaves !== 'function') return callback([]);
  try {
    getSaves(function (list) {
      var saves = (list || []).slice();
      /* newest first */
      saves.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
      callback(saves);
    });
  } catch (e) {
    callback([]);
  }
}

function savesFormatDate(timestamp) {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleString();
  } catch (e) {
    return '';
  }
}

function savesWrite(name, callback) {
  var slot = 'slot' + new Date().getTime();
  if (typeof recordSave !== 'function') return callback(false);
  saveCookie(function () {
    recordSave(slot, function () { callback(true); });
  }, slot, window.stats, window.stats.scene ? window.stats.scene.temps : {},
     window.stats.scene ? window.stats.scene.lineNum : 0,
     window.stats.scene ? window.stats.scene.indent : 0);
}

function savesRestore(save) {
  if (!save || typeof restoreGame !== 'function') return;
  busSet({ screen: 'game' });
  bus.blocks = [];
  bus.pending = null;
  bus.history = [];
  restoreGame(save, null, true);
}
