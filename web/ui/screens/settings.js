/*
 * settings.js — reader preferences.
 *
 * Persists under the SAME store keys the old UI used (preferredBackground,
 * preferredFamily, preferredZoom, preferredAnimation), so a player's settings
 * survive the upgrade. The screen replaces the UI, not the storage contract.
 *
 * changeBackgroundColor lives in legacy.js because authored *script blocks call
 * it directly.
 */

var SETTINGS_ZOOMS = [0.875, 1, 1.125, 1.25, 1.5, 2];

function settingsGetBackground() {
  if (document.body.classList.contains('nightmode')) return 'black';
  if (document.body.classList.contains('whitemode')) return 'white';
  return 'sepia';
}

function settingsSetBackground(color) {
  changeBackgroundColor(color);
  busSet({});
}

function settingsGetFamily() {
  return getFontFamily();
}

function settingsSetFamily(family) {
  document.body.classList.remove('sans');
  document.body.classList.remove('dyslexia');
  if (family === 'sans' || family === 'dyslexia') document.body.classList.add(family);
  if (typeof initStore === 'function' && initStore()) {
    window.store.set('preferredFamily', family);
  }
  busSet({});
}

function settingsGetZoom() {
  var current = parseFloat(document.documentElement.style.fontSize) / 100;
  return isNaN(current) ? 1 : current;
}

function setZoomFactor(zoom) {
  document.documentElement.style.fontSize = (zoom * 100) + '%';
  if (typeof initStore === 'function' && initStore()) {
    window.store.set('preferredZoom', zoom);
  }
  busSet({});
}

function changeFontSize(bigger) {
  var current = settingsGetZoom();
  var i = SETTINGS_ZOOMS.indexOf(current);
  if (i === -1) i = 1;
  i += bigger ? 1 : -1;
  if (i < 0) i = 0;
  if (i >= SETTINGS_ZOOMS.length) i = SETTINGS_ZOOMS.length - 1;
  setZoomFactor(SETTINGS_ZOOMS[i]);
}

function changeFontFamily(family) {
  settingsSetFamily(family);
}

function settingsGetAnimation() {
  return window.animateEnabled !== false;
}

function settingsSetAnimation(enabled) {
  window.animateEnabled = !!enabled;
  if (typeof initStore === 'function' && initStore()) {
    window.store.set('preferredAnimation', enabled ? 1 : 2);
  }
  busSet({});
}
