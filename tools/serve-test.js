#!/usr/bin/env node
/*
 * Runs the real dev server (the thing serve.command / run-server.bat start)
 * and loads web/mygame/ the way a browser does: fetching every script, every
 * stylesheet, and the scene .txt files over HTTP.
 *
 * This is the closest automated check to "does it actually work when I paste
 * my scenes in and open the page".
 *
 * Usage: node tools/serve-test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { JSDOM } = require('/home/claude/node_modules/jsdom');

const root = path.join(__dirname, '..');
const game = process.argv[2];
const live = path.join(root, 'web', 'mygame');
const backup = path.join(root, 'web', '.mygame.servebak');

/*
 * With a game name, reproduce exactly what an author does: keep the shell
 * (index.html, mygame.js, theme.css) and paste in only scene files and images.
 * mygame.js only declares ["startup"]; the real scene list comes from
 * *scene_list inside startup.txt at runtime, so it needs no editing.
 */
if (game) {
  const src = path.join(root, 'fixtures', game, 'mygame');
  if (!fs.existsSync(src)) { console.error('no such fixture: ' + game); process.exit(1); }
  fs.cpSync(live, backup, { recursive: true });
  const shell = {};
  for (const f of ['index.html', 'mygame.js', 'theme.css']) {
    const p = path.join(live, f);
    if (fs.existsSync(p)) shell[f] = fs.readFileSync(p);
  }
  fs.rmSync(live, { recursive: true, force: true });
  fs.mkdirSync(path.join(live, 'scenes'), { recursive: true });
  for (const f in shell) fs.writeFileSync(path.join(live, f), shell[f]);
  for (const f of fs.readdirSync(path.join(src, 'scenes'))) {
    if (f.endsWith('.txt')) {
      fs.copyFileSync(path.join(src, 'scenes', f), path.join(live, 'scenes', f));
    }
  }
  for (const f of fs.readdirSync(src)) {
    if (/\.(png|jpg|jpeg|gif|webp|svg|mp3|ogg)$/i.test(f)) {
      fs.copyFileSync(path.join(src, f), path.join(live, f));
    }
  }
  console.log('set up "' + game + '" as scenes + images only');
}

let pass = 0, fail = 0;
const ok = (n, c, e) => { c ? (pass++, console.log('  ok   ' + n))
                            : (fail++, console.log('  FAIL ' + n + (e ? '  -> ' + e : ''))); };

const server = cp.spawn('node', ['serve.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let buf = '';
let started = false;

function finish(code) {
  try { server.kill('SIGTERM'); } catch (e) {}
  if (game && fs.existsSync(backup)) {
    fs.rmSync(live, { recursive: true, force: true });
    fs.cpSync(backup, live, { recursive: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(code);
}

server.stdout.on('data', d => {
  buf += d.toString();
  const m = buf.match(/http:\/\/localhost:(\d+)/);
  if (m && !started) {
    started = true;
    run(parseInt(m[1], 10));
  }
});

server.stderr.on('data', d => { buf += d.toString(); });

setTimeout(() => {
  if (!started) { console.log('  FAIL server never reported a port\n' + buf); finish(1); }
}, 15000);

function run(port) {
  const url = 'http://localhost:' + port + '/web/mygame/';
  console.log('\nserving ' + url);

  const errors = [];

  JSDOM.fromURL(url, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
  }).then(dom => {
    const win = dom.window;
    win.addEventListener('error', e => errors.push(e.message || String(e)));

    setTimeout(() => {
      const d = win.document;
      const text = d.getElementById('text');
      const prose = text ? text.textContent.trim() : '';
      const control = d.querySelector('.cs-next button, .cs-choices-form button');

      ok('page loaded', !!d.getElementById('main'));
      ok('new UI booted (htmPreact present)', typeof win.htmPreact === 'object');
      ok('engine present', typeof win.Scene === 'function');
      ok('title set from *title', (d.title || '').length > 0, JSON.stringify(d.title));
      ok('scenes fetched and prose rendered', prose.length > 0 || !!control,
        'prose=' + prose.length + ' control=' + !!control);
      ok('no "Couldn\'t load scene" error',
        !errors.some(m => /Couldn't load scene/.test(m)),
        errors.slice(0, 1).join());
      ok('no literal "undefined" rendered',
        !/>\s*undefined\s*</.test(text ? text.innerHTML : ''));

      if (control) {
        control.dispatchEvent(new win.Event('click', { bubbles: true }));
        setTimeout(() => {
          const after = d.getElementById('text').textContent.trim();
          ok('advances to real story text', after.length > 60,
            JSON.stringify(after.slice(0, 70)));
          finish(fail ? 1 : 0);
        }, 1200);
      } else {
        finish(fail ? 1 : 0);
      }
    }, 2500);
  }).catch(e => {
    ok('page loaded', false, e.message);
    finish(1);
  });
}
