#!/usr/bin/env node
/*
 * Renders the new front end in jsdom and plays a real turn of the sample game
 * through the actual engine. Verifies the seam end to end: scene.js -> bridge
 * -> bus -> Preact -> DOM, and back via a click.
 *
 * Run: node tools/render-test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/home/claude/node_modules/jsdom');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div class="cs-shell" id="container1">
    <header class="cs-header"><h1 id="title"></h1><p id="author"></p></header>
    <div id="main"></div>
  </div>
</body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true });

const win = dom.window;
win.requestAnimationFrame = (fn) => setTimeout(fn, 0);

function load(rel) {
  win.eval(fs.readFileSync(path.join(web, rel), 'utf8'));
}

/* engine + new UI, in the same order as index.html */
win.eval('var isWeb = true; var rootDir = "";');
load('util.js');
load('vendor/preact-htm.umd.js');
load('ui/bus.js');
load('ui/stubs.js');
load('ui/legacy.js');
load('ui/bridge.js');
load('ui/app.js');
load('ui/shell.js');
load('scene.js');
load('navigator.js');

console.log('\nload');
ok('htmPreact global present', typeof win.htmPreact === 'object');
ok('Scene constructor present', typeof win.Scene === 'function');
ok('bridge replaced printOptions', typeof win.printOptions === 'function');

/* feed the sample game's scenes from disk instead of over XHR */
const scenesDir = path.join(web, 'mygame', 'scenes');
const allScenes = {};
for (const f of fs.readdirSync(scenesDir)) {
  if (!f.endsWith('.txt')) continue;
  allScenes[f.replace(/\.txt$/, '')] = {
    crc: 0,
    lines: fs.readFileSync(path.join(scenesDir, f), 'utf8').split(/\r?\n/),
    labels: {},
  };
}
win.allScenes = allScenes;
win.Scene.generatedFast = false;

console.log('\nmount');
win.appMount();
ok('#text container exists after mount', !!win.document.getElementById('text'));
ok('legacy text node registered', win.legacyTextNode() === win.document.getElementById('text'));

console.log('\nplay a real scene through the engine');
win.stats = {};
win.nav = new win.SceneNavigator(['startup', 'animal', 'variables', 'gosub', 'ending', 'death']);
const scene = new win.Scene('startup', win.stats, win.nav, { saveSlot: '' });
win.bridgeAttachScene(scene);

let err = null;
try { scene.execute(); } catch (e) { err = e; }
ok('engine executed without throwing', !err, err && err.message);

setTimeout(() => {
  const doc = win.document;
  const text = doc.getElementById('text');
  ok('prose rendered into #text', text && text.textContent.trim().length > 0,
    text && JSON.stringify(text.textContent.slice(0, 60)));

  ok('engine parked something to answer', !!win.bus.pending,
    JSON.stringify(win.bus.pending && win.bus.pending.kind));

  /* advance through page breaks until the engine offers a choice */
  let guard = 0;
  function advanceToChoice(done) {
    if (win.bus.pending && win.bus.pending.kind === 'choice') return done();
    if (guard++ > 20) return done();
    const btn = doc.querySelector('.cs-next button');
    if (!btn) return done();
    btn.dispatchEvent(new win.Event('click', { bubbles: true }));
    setTimeout(() => advanceToChoice(done), 15);
  }

  advanceToChoice(() => {
    const pending = win.bus.pending;
    ok('reached a choice', pending && pending.kind === 'choice',
      pending && pending.kind);
    if (!pending || pending.kind !== 'choice') {
      console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
      return process.exit(failed ? 1 : 0);
    }

    const radios = doc.querySelectorAll('.cs-choices input[type=radio]');
    ok('choices render as native radios', radios.length === pending.options.length,
      radios.length + ' radios vs ' + pending.options.length + ' options');

    const labels = doc.querySelectorAll('.cs-choices label[for]');
    ok('every radio has an associated label', labels.length === radios.length);

    const keys = doc.querySelectorAll('.cs-option-key');
    ok('keyboard numerals shown', keys.length > 0 && keys[0].textContent === '1');
    ok('numerals hidden from screen readers',
      keys[0].getAttribute('aria-hidden') === 'true');

    const before = win.bus.history.length;
    radios[0].checked = true;
    radios[0].dispatchEvent(new win.Event('change', { bubbles: true }));

    setTimeout(() => {
      const form = doc.querySelector('.cs-choices-form');
      form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));

      setTimeout(() => {
        ok('choosing advanced the screen', win.bus.history.length > before,
          'history ' + before + ' -> ' + win.bus.history.length);
        ok('a new screen is rendered',
          doc.getElementById('text').textContent.trim().length > 0);

        console.log('\nlegacy *script contract in a real DOM');
        const t = win.legacyTextNode();
        const div = win.document.createElement('div');
        win.setClass(div, 'statBar statLine');
        t.appendChild(div);
        ok('authored node survives in #text', t.querySelector('.statBar') !== null);
        ok('setClass applied both classes', div.className === 'statBar statLine');

        console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
        process.exit(failed ? 1 : 0);
      }, 30);
    }, 20);
  });
}, 120);
