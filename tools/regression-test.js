#!/usr/bin/env node
/*
 * Regression tests for bugs found by manual playthrough of Choice of Magic.
 * Each test names the symptom it prevents from coming back.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { JSDOM } = require('/home/claude/node_modules/jsdom');
const web = path.join(__dirname, '..', 'web');

let pass = 0, fail = 0;
const ok = (n, c, e) => { c ? (pass++, console.log('  ok   ' + n))
                            : (fail++, console.log('  FAIL ' + n + (e ? '  -> ' + e : ''))); };

function boot(scenes, statsLines) {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body><div id="container1">
       <h1 id="title"></h1><p id="author"></p><div id="main"></div></div></body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  win.requestAnimationFrame = f => setTimeout(f, 0);
  win.scrollTo = () => {};
  win.reportError = () => {};
  const load = r => win.eval(fs.readFileSync(path.join(web, r), 'utf8'));
  win.eval('var isWeb=true; var rootDir="";');
  ['util.js', 'vendor/preact-htm.umd.js', 'ui/bus.js', 'ui/stubs.js', 'ui/legacy.js',
   'ui/bridge.js', 'ui/app.js', 'ui/shell.js', 'scene.js', 'navigator.js',
   'ui/screens/stats.js', 'ui/screens/achievements.js', 'ui/screens/saves.js',
   'ui/screens/settings.js'].forEach(load);

  const all = {};
  for (const name in scenes) all[name] = { crc: 0, labels: {}, lines: scenes[name] };
  if (statsLines) all.choicescript_stats = { crc: 0, labels: {}, lines: statsLines };
  win.allScenes = all;
  win.appMount();
  win.stats = {};
  win.nav = new win.SceneNavigator(Object.keys(all));
  const scene = new win.Scene('startup', win.stats, win.nav, { saveSlot: '' });
  win.bridgeAttachScene(scene);
  win.stats.scene = scene;
  let err = null;
  try { scene.execute(); } catch (e) { err = e; }
  return { win, scene, err };
}

const tests = [];

/* ---------------------------------------------------------------- BUG 1 */
tests.push(['*line_break after an image must not print "undefined"', done => {
  const r = boot({ startup: ['*image cover.png center A cover', '*line_break',
                             'After the image.', '*finish'] });
  setTimeout(() => {
    const text = r.win.bus.blocks.map(b => b.html || '').join(' ');
    ok('no literal "undefined" in output', !/undefined/.test(text),
      JSON.stringify(text.slice(0, 90)));
    done();
  }, 60);
}]);

/* ---------------------------------------------------------------- BUG 2 */
tests.push(['authored *script nodes render in position, not at the end', done => {
  const r = boot({ startup: [
    'First paragraph.',
    '*script target = document.getElementById("text"); d = document.createElement("div"); setClass(d, "statBar"); target.appendChild(d);',
    'Second paragraph.',
    '*finish'] });
  setTimeout(() => {
    const kinds = r.win.bus.blocks.map(b => b.kind);
    const nodeAt = kinds.indexOf('node');
    ok('script node became a positioned block', nodeAt !== -1, kinds.join(','));
    ok('node sits between the two paragraphs',
      nodeAt > 0 && nodeAt < kinds.length - 1, kinds.join(','));
    done();
  }, 80);
}]);

/* ---------------------------------------------------------------- BUG 3 */
tests.push(['authored nodes must not carry over to the next screen', done => {
  const r = boot({ startup: [
    'Opening line.',
    '*script target = document.getElementById("text"); d = document.createElement("div"); setClass(d, "statBar"); target.appendChild(d);',
    '*page_break Onward',
    'Next screen.',
    '*finish'] });
  setTimeout(() => {
    const before = r.win.bus.blocks.filter(b => b.kind === 'node').length;
    ok('node present on the first screen', before === 1, 'found ' + before);
    r.win.bus.pending.resume();
    setTimeout(() => {
      const after = r.win.bus.blocks.filter(b => b.kind === 'node').length;
      ok('node gone after the page break', after === 0, 'found ' + after);
      const dom = r.win.document.getElementById('text').querySelectorAll('.statBar').length;
      ok('and gone from the DOM too', dom === 0, 'found ' + dom);
      done();
    }, 60);
  }, 80);
}]);

/* ---------------------------------------------------------------- BUG 4 */
tests.push(['stats overlay must not touch the story', done => {
  const r = boot(
    { startup: ['*create hp 40', 'Story text here.', '*page_break Go', 'More story.', '*finish'] },
    ['*stat_chart', '  percent hp Health', '*finish']);
  setTimeout(() => {
    const storyBefore = r.win.bus.blocks.length;
    const pendingBefore = r.win.bus.pending;
    r.win.showStats();
    setTimeout(() => {
      ok('overlay opened', r.win.bus.overlay === 'stats', r.win.bus.overlay);
      ok('story blocks untouched', r.win.bus.blocks.length === storyBefore,
        storyBefore + ' -> ' + r.win.bus.blocks.length);
      ok('story pending untouched', r.win.bus.pending === pendingBefore);
      ok('stats rendered to its own channel', r.win.bus.statsBlocks.length > 0,
        'statsBlocks=' + r.win.bus.statsBlocks.length);
      done();
    }, 80);
  }, 80);
}]);

/* ---------------------------------------------------------------- BUG 5 */
tests.push(['stats -> saves -> stats -> close leaves the story playable', done => {
  const r = boot(
    { startup: ['*create hp 40', 'Story text.', '*page_break Continue', 'Second screen.', '*finish'] },
    ['*stat_chart', '  percent hp Health', '*finish']);
  setTimeout(() => {
    const pendingBefore = r.win.bus.pending;
    r.win.showStats();
    setTimeout(() => {
      r.win.showSaves();
      setTimeout(() => {
        r.win.showStats();
        setTimeout(() => {
          r.win.shellCloseOverlay();
          setTimeout(() => {
            ok('overlay closed', r.win.bus.overlay === null, String(r.win.bus.overlay));
            ok('story pending survived the round trip',
              r.win.bus.pending === pendingBefore && !!r.win.bus.pending);
            /* the symptom was: Next did nothing */
            r.win.bus.pending.resume();
            setTimeout(() => {
              const txt = r.win.bus.blocks.map(b => b.html || '').join(' ');
              ok('Next still advances the story', /Second screen/.test(txt),
                JSON.stringify(txt.slice(0, 80)));
              done();
            }, 60);
          }, 40);
        }, 60);
      }, 40);
    }, 60);
  }, 80);
}]);

/* ---------------------------------------------------------------- themes */
tests.push(['themes apply and survive the light/dark scope', done => {
  const r = boot({ startup: ['Hi.', '*finish'] });
  setTimeout(() => {
    r.win.themeSet('terminal');
    ok('theme class applied', r.win.document.body.classList.contains('theme-terminal'));
    ok('themeGet reports it', r.win.themeGet() === 'terminal', r.win.themeGet());
    r.win.changeBackgroundColor('black');
    ok('theme survives nightmode toggle',
      r.win.document.body.classList.contains('theme-terminal') &&
      r.win.document.body.classList.contains('nightmode'));
    r.win.settingsSetFamily('slab');
    ok('typeface class applied', r.win.document.body.classList.contains('font-slab'));
    r.win.themeSet('paperback');
    ok('default theme clears classes', !r.win.document.body.className.match(/theme-/),
      r.win.document.body.className);
    done();
  }, 60);
}]);

let i = 0;
(function next() {
  if (i >= tests.length) {
    console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
    return process.exit(fail ? 1 : 0);
  }
  const [name, fn] = tests[i++];
  console.log('\n' + name);
  try { fn(next); } catch (e) { ok(name, false, e.message); next(); }
})();
