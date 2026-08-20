/*
 * shell.js — the globals that live outside the reading surface.
 *
 * Title/author, the stats round-trip, achievements plumbing, and the menu.
 * The four full screens (stats, saves, settings, achievements) arrive in their
 * own tasks; this file owns the navigation between them and the engine.
 */

function changeTitle(title) {
  document.title = title;
  var el = document.getElementById('title');
  if (el) el.textContent = title;
}

function changeAuthor(author) {
  var el = document.getElementById('author');
  if (el) el.textContent = /^\s*by\s/i.test(author) ? author : 'by ' + author;
}

/* --- stats round-trip ----------------------------------------------------- */
/*
 * *stat_chart lives in choicescript_stats.txt, which the engine runs as a
 * separate scene. Showing stats means: remember where we are, run that scene,
 * and be able to come back to the exact same line.
 */

var shellReturnState = null;

function showStats() {
  if (bus.screen === 'stats') return returnFromStats();
  if (!window.stats || !window.stats.scene) return;

  var scene = window.stats.scene;
  shellReturnState = {
    sceneName: scene.name,
    lineNum: scene.lineNum,
    indent: scene.indent,
    blocks: bus.blocks,
    pending: bus.pending,
  };

  busSet({ screen: 'stats' });
  bus.blocks = [];
  bus.pending = null;

  var statsScene = new Scene('choicescript_stats', window.stats, window.nav, {
    secondaryMode: 'stats',
  });
  bridgeAttachScene(statsScene);
  statsScene.execute();
}

function returnFromStats() {
  if (!shellReturnState) return;
  var s = shellReturnState;
  shellReturnState = null;

  busSet({ screen: 'game' });
  bus.blocks = s.blocks;
  bus.pending = s.pending;

  /* If the player acted while on the stats screen the parked callback is gone;
   * replay the line we left instead of restoring a stale pending. */
  if (!s.pending) {
    var scene = new Scene(s.sceneName, window.stats, window.nav, { saveSlot: '' });
    bridgeAttachScene(scene);
    scene.resetPage();
  }
  busSet({});
}

function redirectFromStats(sceneName, label, originLine, callback) {
  shellReturnState = null;
  busSet({ screen: 'game' });
  bus.blocks = [];
  bus.pending = null;
  var scene = new Scene(sceneName, window.stats, window.nav, { saveSlot: '' });
  bridgeAttachScene(scene);
  if (label) scene.gotoLabel = label;
  scene.execute();
  if (callback) callback();
}

function restoreCheckpointFromStats(slot, callback) {
  shellReturnState = null;
  busSet({ screen: 'game' });
  if (typeof restoreCheckpoint === 'function') restoreCheckpoint(slot, callback);
  else if (callback) callback();
}

/* --- achievements plumbing ------------------------------------------------ */
/* The full screen lands in its own task; this keeps *check_achievements
 * resolving so games that gate on it keep running. */

function showAchievements(hideNextButton) {
  checkAchievements(function () { busSet({ screen: 'achievements' }); });
}

function cacheKnownPurchases(knownPurchases) {}

/* --- menu ----------------------------------------------------------------- */

function showMenu() {
  busSet({ screen: bus.screen === 'settings' ? 'game' : 'settings' });
}

function showSaves() {
  busSet({ screen: bus.screen === 'saves' ? 'game' : 'saves' });
}

/* --- boot ----------------------------------------------------------------- */

/* keep lifetime achievements in storage as they are earned */
function shellRecordAchievement() {
  if (typeof recordAchievements === 'function') recordAchievements();
}

function shellBoot() {
  if (typeof loadPreferences === 'function') loadPreferences();
  appMount();
  if (typeof loadAndRestoreGame === 'function') loadAndRestoreGame();
}

/* Preferences: reuses the existing store keys so a player's settings survive
 * the upgrade. The settings screen replaces the UI, not the storage contract. */
function loadPreferences() {
  if (typeof initStore !== 'function' || !initStore()) {
    window.animateEnabled = true;
    return;
  }
  window.store.get('preferredBackground', function (ok, value) {
    if (ok && /^(black|white)$/.test(value)) {
      document.body.classList.add(value === 'black' ? 'nightmode' : 'whitemode');
    }
  });
  window.store.get('preferredFamily', function (ok, value) {
    if (ok && /^(sans|dyslexia)$/.test(value)) document.body.classList.add(value);
  });
  window.store.get('preferredZoom', function (ok, value) {
    var z = parseFloat(value);
    if (ok && !isNaN(z)) document.documentElement.style.fontSize = (z * 100) + '%';
  });
  window.store.get('preferredAnimation', function (ok, value) {
    window.animateEnabled = parseFloat(value) !== 2;
  });
}
