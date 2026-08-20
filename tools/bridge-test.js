#!/usr/bin/env node
/*
 * Drives the real scene.js through the new bus + bridge with a minimal DOM
 * shim. Proves the seam holds before any rendering code exists.
 *
 * Run: node tools/bridge-test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}

/* --- minimal DOM shim: enough for legacy.js's parent-node path ----------- */
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    className: '', children: [], style: {}, attributes: {},
    appendChild(c) {
      /* real appendChild MOVES the node: detach from its previous parent */
      if (c.parentNode) {
        const sibs = c.parentNode.children;
        const i = sibs.indexOf(c);
        if (i !== -1) sibs.splice(i, 1);
      }
      c.parentNode = this;
      this.children.push(c);
      return c;
    },
    setAttribute(k, v) { this.attributes[k] = v; },
    get firstChild() { return this.children.length ? this.children[0] : null; },
    get textContent() {
      if (this._text !== undefined) return this._text;
      return this.children.map((c) => c.textContent || '').join('');
    },
    set textContent(v) { this._text = v; },
  };
  /* Minimal innerHTML: strip tags into one text node. Enough to exercise the
   * "parse then move children into parent" path that printx relies on. */
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html || ''; },
    set(v) {
      this._html = v;
      const t = makeEl('#text');
      t.textContent = String(v).replace(/<[^>]*>/g, '');
      t.parentNode = this;
      this.children = [t];
    },
  });
  return el;
}

const bodyClasses = new Set();
const sandbox = {
  console,
  setTimeout, clearTimeout,
  document: {
    body: {
      classList: {
        add: (c) => bodyClasses.add(c),
        remove: (c) => bodyClasses.delete(c),
        contains: (c) => bodyClasses.has(c),
      },
      style: {},
    },
    createElement: makeEl,
    createTextNode: (t) => { const n = makeEl('#text'); n.textContent = t; return n; },
    getElementById: () => null,
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}

/* util.js provides safeCall/safeTimeout that the bridge defers to. */
vm.runInContext('var isWeb = true;', sandbox);
load(path.join(web, 'ui', 'bus.js'));
load(path.join(web, 'ui', 'stubs.js'));
load(path.join(web, 'ui', 'legacy.js'));
load(path.join(web, 'ui', 'bridge.js'));

const S = sandbox;

console.log('\nbus');
S.busReset();
let notified = 0;
S.busSubscribe(() => notified++);
S.busPush({ kind: 'text', html: 'hello' });
ok('push appends a block', S.bus.blocks.length === 1);
ok('push notifies subscribers', notified === 1);

console.log('\nbridge: choices');
S.busReset();
let picked = null;
S.printOptions([''], [{ name: 'Left' }, { name: 'Right' }], (o) => { picked = o; });
ok('parks a choice', S.bus.pending && S.bus.pending.kind === 'choice');
ok('carries both options', S.bus.pending.options.length === 2);
S.bus.pending.resume(S.bus.pending.options[1]);
ok('resume delivers the chosen option', picked && picked.name === 'Right',
  JSON.stringify(picked));

console.log('\nbridge: page break');
S.busReset();
let advanced = false;
S.printButton('Next', null, false, () => { advanced = true; });
ok('parks a next button', S.bus.pending.kind === 'next');
ok('carries the button name', S.bus.pending.name === 'Next');
S.bus.pending.resume();
ok('resume runs the continuation', advanced);

console.log('\nbridge: clearScreen');
S.busReset();
S.busPush({ kind: 'text', html: 'old screen' });
let ran = false;
S.clearScreen(() => { ran = true; });
ok('runs the continuation', ran);
ok('clears current blocks', S.bus.blocks.length === 0);
ok('archives the old screen', S.bus.history.length === 1);

console.log('\nbridge: input');
S.busReset();
let typed = null;
S.printInput(null, { long: false }, (v) => { typed = v; });
ok('parks an input', S.bus.pending.kind === 'input');
S.bus.pending.resume('Ada');
ok('resume delivers the value', typed === 'Ada');

console.log('\nbridge: image carries alt text');
S.busReset();
S.printImage('cover.png', 'center', 'A dragon', false);
ok('image block pushed', S.bus.blocks[0].kind === 'image');
ok('alt text preserved', S.bus.blocks[0].alt === 'A dragon');

console.log('\nstubs');
let purchaseResult = null;
S.checkPurchase('adfree', (okFlag, result) => { purchaseResult = result; });

console.log('\nlegacy: authored *script contract');
const parent = S.document.createElement('div');
S.printx('hi <b>there</b>', parent);
ok('printx writes to an explicit parent', parent.children.length > 0);
S.changeBackgroundColor('black');
ok('changeBackgroundColor sets nightmode', S.document.body.classList.contains('nightmode'));
ok('isNightMode reflects it', S.isNightMode() === true);
S.changeBackgroundColor('sepia');
ok('sepia clears nightmode', !S.document.body.classList.contains('nightmode'));
const el = S.document.createElement('div');
S.setClass(el, 'statBar statLine');
ok('setClass assigns className', el.className === 'statBar statLine');

setTimeout(() => {
  console.log('\nstubs (async)');
  ok('checkPurchase reports owned', purchaseResult && purchaseResult.adfree === true,
    JSON.stringify(purchaseResult));
  ok('billing reported unsupported', purchaseResult && purchaseResult.billingSupported === false);

  console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed ? 1 : 0);
}, 20);
