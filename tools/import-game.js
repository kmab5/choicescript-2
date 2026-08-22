#!/usr/bin/env node
/*
 * import-game.js — install a published game into web/mygame/ correctly.
 *
 *   node tools/import-game.js fixtures/choice-of-magic
 *   node tools/import-game.js ~/Downloads/mygame
 *
 * Published ChoiceScript games ship a COMPLETE copy of the old runtime,
 * including their own mygame/index.html that loads ../ui.js and ../style.css.
 * Copying that folder wholesale drags the old front end back in, and
 * compile.js then dies on the missing files.
 *
 * So this copies the game's CONTENT — scenes and media — and keeps this
 * project's index.html and mygame.js. That is the same rule authors follow by
 * hand: drop your .txt files in scenes/, leave the shell alone.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dest = path.join(root, 'web', 'mygame');

/* Files that belong to the runtime, not to the game. Never copied. */
const RUNTIME_FILES = new Set([
  'index.html', 'mygame.js', 'version.js', 'scene.js', 'ui.js', 'util.js',
  'persist.js', 'navigator.js', 'style.css', 'alertify.js', 'alertify.min.js',
  'alertify.css', 'fastclick.js', 'credits.html', 'sandbox.html',
  'cache.php', 'redirect.php', 'theme.css'
]);

/* Never copy credentials, even if a game ships them. */
const SECRET_EXT = new Set(['.pem', '.key', '.p12', '.keystore', '.mobileprovision']);

function findGameDir(input) {
  const abs = path.resolve(input);
  if (!fs.existsSync(abs)) throw new Error('No such path: ' + abs);
  if (fs.existsSync(path.join(abs, 'scenes'))) return abs;
  if (fs.existsSync(path.join(abs, 'mygame', 'scenes'))) return path.join(abs, 'mygame');
  throw new Error('No scenes/ directory found under ' + abs);
}

function copyContent(src, out) {
  let scenes = 0, media = 0, skipped = [];
  fs.mkdirSync(out, { recursive: true });

  const scenesSrc = path.join(src, 'scenes');
  const scenesOut = path.join(out, 'scenes');
  fs.rmSync(scenesOut, { recursive: true, force: true });
  fs.mkdirSync(scenesOut, { recursive: true });
  for (const f of fs.readdirSync(scenesSrc)) {
    if (!f.endsWith('.txt')) continue;
    fs.copyFileSync(path.join(scenesSrc, f), path.join(scenesOut, f));
    scenes++;
  }

  for (const f of fs.readdirSync(src)) {
    const full = path.join(src, f);
    if (fs.statSync(full).isDirectory()) continue;
    if (RUNTIME_FILES.has(f)) { skipped.push(f); continue; }
    if (SECRET_EXT.has(path.extname(f).toLowerCase())) { skipped.push(f + ' (credential)'); continue; }
    fs.copyFileSync(full, path.join(out, f));
    media++;
  }
  return { scenes, media, skipped };
}

const input = process.argv[2];
if (!input) {
  console.error('Usage: node tools/import-game.js <path-to-game>');
  process.exit(1);
}

const src = findGameDir(input);

/*
 * Preserve the runtime shell across the import. If web/mygame/index.html is
 * missing, or is a published game's own shell pointing at the old runtime,
 * fall back to the canonical copy in web/shell/.
 */
const shellSrc = path.join(root, 'web', 'shell', 'index.html');
const LEGACY = /\.\.\/(ui|alertify(\.min)?)\.js|\.\.\/style\.css/;

const keep = {};
for (const f of ['index.html', 'mygame.js', 'theme.css']) {
  const p = path.join(dest, f);
  if (fs.existsSync(p)) keep[f] = fs.readFileSync(p);
}

if (!keep['index.html'] || LEGACY.test(keep['index.html'].toString())) {
  if (fs.existsSync(shellSrc)) {
    keep['index.html'] = fs.readFileSync(shellSrc);
    console.log('Restored the current shell from web/shell/index.html');
  }
}

const result = copyContent(src, dest);

for (const f in keep) fs.writeFileSync(path.join(dest, f), keep[f]);

console.log('Imported from ' + src);
console.log('  ' + result.scenes + ' scene files');
console.log('  ' + result.media + ' media/asset files');
if (result.skipped.length) {
  console.log('  skipped (runtime shell kept): ' + result.skipped.join(', '));
}
console.log('\nRun serve.command and open web/mygame/, or run compile.js to publish.');
