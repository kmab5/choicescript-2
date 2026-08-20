/*
 * legacy.js — back-compat globals for authored *script blocks.
 *
 * The engine respects the render seam. Authored content does not. Shipped games
 * contain *script blocks that do things like:
 *
 *   target = document.getElementById('text');
 *   div = document.createElement("div");
 *   setClass(div, "statBar statLine");
 *   printx("\u00a0" + stats["label_"], labelbox);
 *   if (document.body.classList.contains("nightmode")) { ... }
 *   changeBackgroundColor("black");
 *   window.animateEnabled = false;
 *
 * Every one of those must keep working or shipped games lose their custom stat
 * bars. This file is the contract.
 *
 * The rule: when a `parent` node is supplied, write straight to it (legacy
 * path, bypasses the bus). When it is omitted, route into the bus so the normal
 * renderer handles it.
 */

/* bbcode used by printx/println/printParagraph. Kept identical to ui.js. */
function replaceBbCode(msg) {
  return String(msg)
    .replace(/\[n\/\]/g, '<br>')
    .replace(/\[b\]/g, '<b>').replace(/\[\/b\]/g, '</b>')
    .replace(/\[i\]/g, '<i>').replace(/\[\/i\]/g, '</i>')
    .replace(/\[url=([^\]]+)\]/g, '<a href="$1" target="_blank" rel="noopener">')
    .replace(/\[\/url\]/g, '</a>')
    .replace(/\[c\]/g, '<span class="capsSmall">').replace(/\[\/c\]/g, '</span>');
}

function setClass(element, classString) {
  if (element) element.className = classString;
}

function printx(msg, parent) {
  var html = replaceBbCode(msg);
  if (parent) {
    var span = document.createElement('span');
    span.innerHTML = html;
    while (span.firstChild) parent.appendChild(span.firstChild);
    return;
  }
  busPush({ kind: 'text', html: html, inline: true });
}

function println(msg, parent) {
  if (parent) {
    printx(msg, parent);
    parent.appendChild(document.createElement('br'));
    return;
  }
  busPush({ kind: 'text', html: replaceBbCode(msg), inline: true });
  busPush({ kind: 'linebreak' });
}

function printParagraph(msg, parent) {
  if (msg === '' || msg === null || msg === undefined) return;
  if (parent) {
    var p = document.createElement('p');
    p.innerHTML = replaceBbCode(msg);
    parent.appendChild(p);
    return;
  }
  busPush({ kind: 'text', html: replaceBbCode(msg) });
}

/* Theme scopes. Games flip these directly and also read them back. */
function changeBackgroundColor(color) {
  var body = document.body;
  body.classList.remove('nightmode');
  body.classList.remove('whitemode');
  if (color === 'black') body.classList.add('nightmode');
  else if (color === 'white') body.classList.add('whitemode');
  if (typeof initStore === 'function' && initStore()) {
    window.store.set('preferredBackground', color);
  }
}

function isNightMode() {
  return document.body.classList.contains('nightmode');
}

function getFontFamily() {
  if (document.body.classList.contains('sans')) return 'sans';
  if (document.body.classList.contains('dyslexia')) return 'dyslexia';
  return 'serif';
}

/*
 * A *script block may append a node to #text at any moment, including while the
 * renderer is mid-update. Preact would discard such a node on its next diff, so
 * the renderer owns a dedicated escape-hatch container that it never touches.
 * legacyTextNode() returns it, and app.js keeps `#text` pointing at it.
 */
var legacyTextEl = null;

function legacySetTextNode(el) {
  legacyTextEl = el;
}

function legacyTextNode() {
  return legacyTextEl || document.getElementById('text');
}
