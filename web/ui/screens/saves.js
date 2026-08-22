/*
 * saves.js — save slot data for *save_game / *restore_game.
 *
 * util.js already owns the storage: getSaves reads the slot list, recordSave
 * writes one, computeCookie serialises {stats, temps, lineNum, indent} and
 * restoreGame replays from it. This file only shapes that for the renderer.
 */

/*
 * util.js stores only the engine state per slot; there is no name field, and
 * getSaves derives `timestamp` by stripping 4 characters off the slot id (it
 * expects slots called save<timestamp>). Names are ours, so we keep them in a
 * parallel key and stitch them on after loading.
 */
function savesLoad(callback) {
  if (typeof getSaves !== 'function') return callback([]);
  if (typeof shellCanSave === 'function' && !shellCanSave()) return callback([]);
  try {
    getSaves(function (list) {
      var saves = (list || []).slice();
      saves.sort(function (a, b) {
        return (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0);
      });
      var pending = saves.length;
      if (!pending) return callback(saves);
      saves.forEach(function (save) {
        window.store.get('savename_save' + save.timestamp, function (ok, value) {
          if (ok && value) save.name = value;
          if (--pending === 0) callback(saves);
        });
      });
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
  /* upstream derives the timestamp by trimming "save" off the front */
  var stamp = new Date().getTime();
  var slot = 'save' + stamp;
  if (typeof recordSave !== 'function') return callback(false, 'Saving is not available.');
  if (typeof shellCanSave === 'function' && !shellCanSave()) {
    return callback(false, 'Saving is unavailable: no storage for this game.');
  }
  try {
    saveCookie(function () {
      recordSave(slot, function () {
        var label = (name && name.trim()) ? name.trim() : 'Save ' +
          new Date(stamp).toLocaleString();
        window.store.set('savename_' + slot, label, function () {
          callback(true);
        });
      });
    }, slot, window.stats, window.stats.scene ? window.stats.scene.temps : {},
       window.stats.scene ? window.stats.scene.lineNum : 0,
       window.stats.scene ? window.stats.scene.indent : 0);
  } catch (e) {
    if (typeof console !== 'undefined') console.error(e);
    callback(false, 'Could not save: ' + (e && e.message ? e.message : 'unknown error'));
  }
}

function savesRestore(save) {
  if (!save || typeof restoreGame !== 'function') return;
  busSet({ screen: 'game' });
  bus.blocks = [];
  bus.pending = null;
  bus.history = [];
  restoreGame(save, null, true);
}
