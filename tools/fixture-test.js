#!/usr/bin/env node
/*
 * Runs quicktest against each fixture game by temporarily swapping its
 * mygame/ folder into web/mygame/, then restoring the original.
 *
 * Usage:
 *   node tools/fixture-test.js                  # compare against baseline
 *   node tools/fixture-test.js --save-baseline  # record current results
 *   node tools/fixture-test.js fool             # one fixture
 *
 * Two fixture games fail on the CURRENT engine for reasons unrelated to the
 * front end: they shipped against an older scene.js that lacked the
 * `choiceEnd === 0` fallthrough check in printLoop. Requiring all-pass would be
 * wrong, so we compare against a recorded baseline instead. A regression is any
 * game whose result got WORSE than baseline.
 *
 * Exits 0 if no game regressed against the baseline, 1 otherwise.
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const fixturesDir = path.join(root, 'fixtures');
const live = path.join(root, 'web', 'mygame');
const backup = path.join(root, 'web', '.mygame.backup');

function restore() {
  if (!fs.existsSync(backup)) return;
  fs.rmSync(live, { recursive: true, force: true });
  fs.cpSync(backup, live, { recursive: true });
  fs.rmSync(backup, { recursive: true, force: true });
}

function runGame(game) {
  const src = path.join(fixturesDir, game, 'mygame');
  if (!fs.existsSync(src)) return { game, ok: false, err: 'no mygame/ directory' };

  fs.cpSync(live, backup, { recursive: true });
  fs.rmSync(live, { recursive: true, force: true });
  fs.cpSync(src, live, { recursive: true });

  try {
    const out = execFileSync('node', ['quicktest.js'], {
      cwd: root,
      stdio: 'pipe',
      timeout: 180000,
      maxBuffer: 64 * 1024 * 1024,
    }).toString();
    return { game, ok: /QUICKTEST PASSED/.test(out) };
  } catch (e) {
    const out = ((e.stdout || '') + (e.stderr || '') || e.message).toString();
    return { game, ok: false, err: out.trim().split('\n').slice(-4).join('\n') };
  } finally {
    restore();
  }
}

process.on('SIGINT', () => { restore(); process.exit(130); });

const named = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const games = named.length
  ? named
  : fs.readdirSync(fixturesDir).filter((f) =>
      fs.statSync(path.join(fixturesDir, f)).isDirectory());

const baselinePath = path.join(__dirname, 'fixture-baseline.json');
const saving = process.argv.includes('--save-baseline');
const baseline = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  : null;

const results = {};
for (const g of games) {
  const r = runGame(g);
  results[g] = r.ok;
  const expected = baseline ? baseline[g] : undefined;
  let tag = r.ok ? 'PASS  ' : 'FAIL  ';
  if (!saving && expected === false && !r.ok) tag = 'KNOWN ';
  console.log(tag + r.game);
  if (!r.ok && r.err && expected !== false) {
    console.log(r.err.replace(/^/gm, '        '));
  }
}

if (saving) {
  fs.writeFileSync(baselinePath, JSON.stringify(results, null, 2) + '\n');
  console.log('\nBaseline saved to tools/fixture-baseline.json');
  process.exit(0);
}

if (!baseline) {
  console.log('\nNo baseline recorded. Run with --save-baseline first.');
  process.exit(1);
}

const regressions = games.filter((g) => baseline[g] === true && results[g] === false);
const fixes = games.filter((g) => baseline[g] === false && results[g] === true);

for (const g of fixes) console.log('IMPROVED: ' + g + ' now passes');
for (const g of regressions) console.log('REGRESSION: ' + g + ' passed at baseline, fails now');

const passing = games.filter((g) => results[g]).length;
console.log('\n' + passing + '/' + games.length + ' passing; ' +
  regressions.length + ' regressions');
process.exit(regressions.length ? 1 : 0);
