#!/usr/bin/env node
/*
 * Imports a published game the documented way, compiles it to a single file,
 * and plays the result. Guards the two bugs that made Choice of Magic fail:
 *
 *   1. published games ship their own mygame/index.html pointing at the old
 *      runtime, so copying the folder wholesale reintroduced deleted files
 *   2. compile.js bundled only scenes named in *scene_list, so scenes reached
 *      by *gosub_scene (e.g. utils.txt) were missing and the game died with
 *      "Couldn't load scene"
 *
 * Usage: node tools/import-compile-test.js [game]   (default: martian-job)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { JSDOM } = require('/home/claude/node_modules/jsdom');

const root = path.join(__dirname, '..');
const live = path.join(root, 'web', 'mygame');
const backup = path.join(root, 'web', '.mygame.compilebak');
const game = process.argv[2] || 'martian-job';

let pass = 0, fail = 0;
const ok = (n, c, e) => { c ? (pass++, console.log('  ok   ' + n))
                            : (fail++, console.log('  FAIL ' + n + (e ? '  -> ' + e : ''))); };

function restore() {
  if (!fs.existsSync(backup)) return;
  fs.rmSync(live, { recursive: true, force: true });
  fs.cpSync(backup, live, { recursive: true });
  fs.rmSync(backup, { recursive: true, force: true });
}
process.on('SIGINT', () => { restore(); process.exit(130); });

fs.cpSync(live, backup, { recursive: true });

let out = '';
try {
  /*
   * First: the NAIVE path. Copy the published game folder in wholesale, the way
   * anyone would, and compile. Its own index.html points at the deleted runtime,
   * which used to yield a multi-megabyte page that was completely inert.
   */
  console.log('\nnaive setup (whole game folder copied in)');
  fs.rmSync(live, { recursive: true, force: true });
  fs.cpSync(path.join(root, 'fixtures', game, 'mygame'), live, { recursive: true });
  cp.execFileSync('node', ['compile.js'], { cwd: root, stdio: 'pipe', timeout: 600000 });
  const naive = fs.readFileSync(path.join(root, 'output.html'), 'utf8');
  ok('current UI still inlined despite legacy shell',
    /busSubscribe/.test(naive) && /htmPreact/.test(naive));
  ok('naive build is not inert',
    /appMount/.test(naive) && /printOptions/.test(naive));

  fs.rmSync(live, { recursive: true, force: true });
  fs.cpSync(backup, live, { recursive: true });

  console.log('\nimport');
  const importLog = cp.execFileSync('node',
    [path.join(root, 'tools', 'import-game.js'), path.join(root, 'fixtures', game)],
    { cwd: root, stdio: 'pipe' }).toString();
  ok('import succeeded', /scene files/.test(importLog));
  ok('runtime shell preserved', fs.existsSync(path.join(live, 'index.html')) &&
    /ui\/bus\.js/.test(fs.readFileSync(path.join(live, 'index.html'), 'utf8')));
  ok('no credentials copied',
    !fs.readdirSync(live).some(f => /\.(pem|key|p12)$/i.test(f)));

  console.log('\ncompile');
  cp.execFileSync('node', ['compile.js'], { cwd: root, stdio: 'pipe', timeout: 600000 });
  const outPath = path.join(root, 'output.html');
  ok('output.html produced', fs.existsSync(outPath));
  out = fs.readFileSync(outPath, 'utf8');
  ok('new UI inlined', /busSubscribe/.test(out) && /htmPreact/.test(out));
  ok('no external script or css refs',
    !/<script src="/.test(out) && !/<link[^>]+\.css"/.test(out));
} catch (e) {
  ok('import + compile', false, (e.stdout || e.message).toString().slice(-300));
  restore();
  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(1);
}

restore();

console.log('\nplay the exported file');
const dom = new JSDOM(out, { runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'https://example.com/' });
const win = dom.window;
const errors = [];
win.addEventListener('error', e => errors.push(e.message));

setTimeout(() => {
  const d = win.document;
  const text = d.getElementById('text');
  const control = d.querySelector('.cs-next button, .cs-choices-form button');
  ok('a control is rendered', !!control, control ? '' : 'none found');
  ok('no "Couldn\'t load scene" error',
    !errors.some(m => /Couldn't load scene/.test(m)), errors.slice(0, 1).join());
  ok('no literal "undefined" rendered',
    !/>\s*undefined\s*</.test(text ? text.innerHTML : ''));

  if (control) {
    control.dispatchEvent(new win.Event('click', { bubbles: true }));
    setTimeout(() => {
      const prose = d.getElementById('text').textContent.trim();
      ok('story advances after clicking', prose.length > 40,
        JSON.stringify(prose.slice(0, 60)));
      console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
      process.exit(fail ? 1 : 0);
    }, 800);
  } else {
    console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
    process.exit(1);
  }
}, 2500);
