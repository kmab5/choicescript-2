# ChoiceScript Front-End Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ChoiceScript web front end with a modern, themeable one that runs every existing released game with no edits to its scene files and no change to game mechanics.

**Architecture:** The engine calls ~55 global functions and never touches the DOM itself. A bridge layer implements those globals, translating each engine call into either an append to the current screen or a suspend that parks a resume callback. Rendering becomes a pure function of a plain-data `bus` object, drawn by Preact components. `scene.js` is not modified.

**Tech Stack:** Preact 10 + htm 3, vendored as a single classic-script UMD bundle (`web/vendor/preact-htm.umd.js`, global `htmPreact`, 5.4 KB gzipped). No build step, no ES modules, no package manager at author time.

## Global Constraints

- Zero build step for authors: drop `.txt` into `web/mygame/scenes/`, run `serve.command`, play.
- No ES modules and no bundler: `compile.js` regex-scrapes `<script src="...">` and inlines it; `import` breaks the single-file export.
- `scene.js` is not modified. Zero forked lines. Exactly one prototype override is permitted: `Scene.prototype.stat_chart`.
- `quicktest` and `randomtest` must pass against all five fixture games after every task.
- **Legacy DOM contract must be preserved** (discovered from fixtures): authored `*script` blocks reach into the DOM directly. These must keep working:
  - `document.getElementById('text')` returns the live text container.
  - `setClass(element, classString)` is a global.
  - `printx(msg, parent)` appends to an arbitrary parent node.
  - `document.body.classList` carries `nightmode` / `whitemode`.
  - `changeBackgroundColor(color)` is a global.
  - `window.animateEnabled` is writable.
- Commerce stubs return: `checkPurchase` → owned, `getPrice` → free, `isRegistered` → false, `showFullScreenAdvertisementButton` → invoke callback immediately.
- Licensed fixture games live in `fixtures/` and are gitignored. Never commit game text.

---

## File Structure

| File | Responsibility |
|---|---|
| `web/vendor/preact-htm.umd.js` | Vendored renderer. Never edited. |
| `web/ui/bus.js` | The state object + subscribe/notify. No DOM, no engine knowledge. |
| `web/ui/bridge.js` | Implements engine globals; translates calls into bus mutations. |
| `web/ui/legacy.js` | Back-compat globals for authored `*script` blocks. |
| `web/ui/stubs.js` | Commerce/platform no-ops. |
| `web/ui/app.js` | Root component; renders bus state; mounts screens. |
| `web/ui/screens/stats.js` | Stat chart panel (percent, text, opposed_pair rows). |
| `web/ui/screens/saves.js` | Save slot list. |
| `web/ui/screens/settings.js` | Theme, font, zoom, animation preferences. |
| `web/ui/screens/achievements.js` | Locked/unlocked achievement list. |
| `web/theme/tokens.css` | Every colour/size/font as a custom property. |
| `web/theme/default.css` | Default skin built on tokens. |
| `web/mygame/theme.css` | Optional per-game token overrides. |
| `web/mygame/index.html` | Shell; script tags in dependency order. |
| `tools/fixture-test.js` | Runs quicktest/randomtest against each fixture game. |

---

## Task 1: Fixture test harness

**Files:**
- Create: `tools/fixture-test.js`

**Interfaces:**
- Produces: `node tools/fixture-test.js [gameName]` exits 0 on pass, 1 on failure.

Without this, "no mechanical regressions" is unverifiable. It must exist before any UI code.

- [ ] **Step 1: Write the harness**

It copies a fixture's `mygame/` over `web/mygame/`, runs `quicktest.js` headless, restores the original `mygame/`, and reports per-game pass/fail.

```js
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const fixtures = path.join(root, 'fixtures');
const live = path.join(root, 'web', 'mygame');
const backup = path.join(root, 'web', '.mygame.backup');

function run(game) {
  const src = path.join(fixtures, game, 'mygame');
  if (!fs.existsSync(src)) throw new Error('no mygame/ in ' + game);
  if (!fs.existsSync(backup)) fs.cpSync(live, backup, { recursive: true });
  fs.rmSync(live, { recursive: true, force: true });
  fs.cpSync(src, live, { recursive: true });
  try {
    execFileSync('node', [path.join(root, 'quicktest.js')], { cwd: root, stdio: 'pipe' });
    return { game, ok: true };
  } catch (e) {
    return { game, ok: false, err: (e.stdout || e.message).toString().slice(-800) };
  } finally {
    fs.rmSync(live, { recursive: true, force: true });
    fs.cpSync(backup, live, { recursive: true });
  }
}

const games = process.argv[2] ? [process.argv[2]] : fs.readdirSync(fixtures);
let failed = 0;
for (const g of games) {
  const r = run(g);
  console.log((r.ok ? 'PASS ' : 'FAIL ') + r.game);
  if (!r.ok) { failed++; console.log(r.err); }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Establish the baseline**

Run: `node tools/fixture-test.js`
Expected: record which games pass on the **stock** front end. Games that already fail are pre-existing failures, not regressions. This baseline is the acceptance bar for every later task.

- [ ] **Step 3: Commit**

```bash
git add tools/fixture-test.js
git commit -m "test: add fixture game harness"
```

---

## Task 2: The bus

**Files:**
- Create: `web/ui/bus.js`

**Interfaces:**
- Produces: global `bus` with shape
  `{ blocks: [], pending: null, loading: false, modal: null, history: [], screen: "game" }`
- Produces: `busSet(patch)`, `busPush(block)`, `busSubscribe(fn)`, `busReset()`.
- Block shape: `{ kind: "text"|"image"|"youtube"|"linebreak", ... }`.
- Pending shape: `{ kind: "choice"|"next"|"input"|"checkboxes", resume: Function, ... }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/uitest.js
QUnit.test("bus notifies subscribers on push", function(assert) {
  busReset();
  var calls = 0;
  busSubscribe(function() { calls++; });
  busPush({ kind: "text", html: "hello" });
  assert.equal(bus.blocks.length, 1);
  assert.equal(calls, 1);
});
```

- [ ] **Step 2: Run and confirm it fails** — `busReset is not defined`.
- [ ] **Step 3: Implement `bus.js`** as a plain object plus a subscriber array; `busSet`/`busPush` mutate then notify.
- [ ] **Step 4: Run and confirm pass.**
- [ ] **Step 5: Commit** — `feat: add ui bus`

---

## Task 3: Commerce and platform stubs

**Files:**
- Create: `web/ui/stubs.js`

**Interfaces:**
- Produces globals: `checkPurchase`, `getPrice`, `purchase`, `restorePurchases`, `isRegistered`, `isRegisterAllowed`, `isRestorePurchasesSupported`, `isWebPurchaseSupported`, `isAdvertisingSupported`, `isFullScreenAdvertisingSupported`, `showFullScreenAdvertisement`, `showFullScreenAdvertisementButton`, `loginForm`, `loginDiv`, `subscribe`, `subscribeByMail`, `subscribeLink`, `promptEmailAddress`, `getPassword`, `showPassword`, `moreGames`, `printShareLinks`, `isShareConfigured`, `printFollowButtons`, `isFollowEnabled`, `promptForReview`, `prepareReviewPrompt`, `isReviewSupported`, `printDiscount`, `registerNativeAchievement`, `isPrerelease`, `platformCode`, `trackEvent`, `getSupportEmail`, `kindleButton`, `downloadLink`, `showTicker`.

All five fixture games call `*check_purchase` (17 uses) and `*subscribe` (15 uses), so this task unblocks every fixture.

- [ ] **Step 1: Write the failing test**

```js
QUnit.test("checkPurchase reports owned", function(assert) {
  var done = assert.async();
  checkPurchase("adfree", function(ok, result) {
    assert.ok(ok);
    assert.ok(result.adfree);
    done();
  });
});
```

- [ ] **Step 2: Run and confirm it fails.**
- [ ] **Step 3: Implement.** Each stub invokes its callback asynchronously via `safeTimeout(fn, 0)` to match the async contract the engine expects. `checkPurchase(products, cb)` builds a result object with every requested product set true, plus `billingSupported: false`.
- [ ] **Step 4: Run and confirm pass.**
- [ ] **Step 5: Commit** — `feat: add commerce stubs`

---

## Task 4: Legacy DOM compatibility layer

**Files:**
- Create: `web/ui/legacy.js`

**Interfaces:**
- Produces globals: `setClass(el, s)`, `printx(msg, parent)`, `println(msg, parent)`, `printParagraph(msg, parent)`, `changeBackgroundColor(color)`, `isNightMode()`.
- Guarantees `document.getElementById('text')` resolves to the live text container at all times.

This exists because fixture `*script` blocks build DOM nodes by hand. Without it, custom stat bars in shipped games break.

- [ ] **Step 1: Write the failing test**

```js
QUnit.test("printx appends to an explicit parent", function(assert) {
  var parent = document.createElement("div");
  printx("hi <b>there</b>", parent);
  assert.equal(parent.textContent, "hi there");
});

QUnit.test("changeBackgroundColor toggles body class", function(assert) {
  changeBackgroundColor("black");
  assert.ok(document.body.classList.contains("nightmode"));
  changeBackgroundColor("sepia");
  assert.notOk(document.body.classList.contains("nightmode"));
});
```

- [ ] **Step 2: Run and confirm it fails.**
- [ ] **Step 3: Implement.** When `parent` is supplied, write directly to it (legacy path). When omitted, route into the bus. `printx` applies the existing bbcode replacement so `[b]`/`[i]` keep working.
- [ ] **Step 4: Run and confirm pass.**
- [ ] **Step 5: Commit** — `feat: add legacy DOM compatibility layer`

---

## Task 5: The bridge

**Files:**
- Create: `web/ui/bridge.js`

**Interfaces:**
- Consumes: `bus`, `busPush`, `busSet` (Task 2); `printx` (Task 4).
- Produces globals: `clearScreen(code)`, `printOptions(groups, options, cb)`, `printButton(name, parent, isSubmit, cb)`, `printInput(...)`, `printCheckboxes(...)`, `printImage(source, alignment, alt, invert)`, `printYoutubeFrame(slug)`, `playSound(source)`, `printLink(target, href, text, onclick)`, `printFooter()`, `startLoading()`, `doneLoading()`, `asyncAlert(msg, cb)`, `asyncConfirm(msg, cb)`, `achieve(name, title, desc)`, `curl()`, `focusFirst()`, `setButtonTitles()`.
- Produces: `bridgeAttachScene(scene)` — assigns `scene.target` to the bridge-owned text node so the engine's `if (!target) target = document.getElementById('text')` fallbacks never fire.

`*page_break` is the hottest command in the corpus (3,505 uses), so `printButton` and `clearScreen` are the critical path.

- [ ] **Step 1: Write the failing test**

```js
QUnit.test("printOptions parks a resume callback", function(assert) {
  busReset();
  var picked = null;
  printOptions([""], [{ name: "Left" }, { name: "Right" }], function(o) { picked = o; });
  assert.equal(bus.pending.kind, "choice");
  assert.equal(bus.pending.options.length, 2);
  bus.pending.resume(bus.pending.options[1]);
  assert.equal(picked.name, "Right");
});

QUnit.test("clearScreen archives the screen and runs its callback", function(assert) {
  busReset();
  busPush({ kind: "text", html: "old" });
  var ran = false;
  clearScreen(function() { ran = true; });
  assert.ok(ran);
  assert.equal(bus.blocks.length, 0);
  assert.equal(bus.history.length, 1);
});
```

- [ ] **Step 2: Run and confirm it fails.**
- [ ] **Step 3: Implement** per the mapping table in the spec.
- [ ] **Step 4: Run and confirm pass.**
- [ ] **Step 5: Commit** — `feat: add engine-to-bus bridge`

---

## Task 6: Design tokens and default skin

**Files:**
- Create: `web/theme/tokens.css`, `web/theme/default.css`
- Create: `web/mygame/theme.css` (empty, with a comment showing how to override)

**Interfaces:**
- Produces custom properties: `--cs-bg`, `--cs-fg`, `--cs-accent`, `--cs-choice-bg`, `--cs-choice-bg-hover`, `--cs-border`, `--cs-radius`, `--cs-font-body`, `--cs-font-ui`, `--cs-measure`, `--cs-space-1` … `--cs-space-6`, `--cs-stat-fill`, `--cs-stat-track`.
- Three theme scopes on `<body>`: default (sepia), `.nightmode`, `.whitemode`. Every token is redefined per scope.

- [ ] **Step 1: Write tokens.css** — token definitions only, no component rules.
- [ ] **Step 2: Write default.css** — all component rules referencing tokens exclusively. No literal colours outside `tokens.css`.
- [ ] **Step 3: Verify contrast.** Check body text and choice text against their backgrounds in all three scopes; require WCAG AA (4.5:1).
- [ ] **Step 4: Commit** — `feat: add theme tokens and default skin`

---

## Task 7: App shell and choice rendering

**Files:**
- Create: `web/ui/app.js`
- Modify: `web/mygame/index.html`

**Interfaces:**
- Consumes: `bus`, `busSubscribe` (Task 2); `htmPreact` global.
- Produces: `appMount()` — renders into `#main`, subscribes to the bus.
- Produces DOM contract: a `<div id="text">` always present inside `#main`.

Choices render as a real `<form>` with `<input type="radio">` and `<label>`, preserving the existing screen-reader behaviour. Not `<div onClick>`.

- [ ] **Step 1: Write the failing test** — mount into a detached container, push a choice, assert `form input[type=radio]` count equals option count and each has an associated `<label>`.
- [ ] **Step 2: Run and confirm it fails.**
- [ ] **Step 3: Implement** the root component with a `switch` on `bus.pending.kind`.
- [ ] **Step 4: Update `index.html`** script order: `persist.js`, `util.js`, `vendor/preact-htm.umd.js`, `ui/bus.js`, `ui/stubs.js`, `ui/legacy.js`, `ui/bridge.js`, `ui/app.js`, `scene.js`, `navigator.js`, `mygame.js`. All classic `<script src>`.
- [ ] **Step 5: Run fixture harness** — `node tools/fixture-test.js`; must match the Task 1 baseline.
- [ ] **Step 6: Commit** — `feat: add app shell and choice rendering`

---

## Task 8: Screen transitions

**Files:**
- Modify: `web/ui/app.js`
- Modify: `web/theme/default.css`

Replaces the `container1`/`container2` clone plus `translateY(pageYOffset)` plus `scrollTo(0,1)` hack with two stacked panes and a crossfade, using the View Transition API where available and a CSS fallback otherwise. Wrapped in `@media (prefers-reduced-motion: no-preference)`.

- [ ] **Step 1: Implement the crossfade.**
- [ ] **Step 2: Verify** `window.animateEnabled = false` (set by fixture `*script` blocks) disables it.
- [ ] **Step 3: Verify** reduced-motion disables it.
- [ ] **Step 4: Commit** — `feat: replace page transition with crossfade`

---

## Task 9: Stats screen

**Files:**
- Create: `web/ui/screens/stats.js`
- Modify: `web/ui/bridge.js` (add the single permitted override)

**Interfaces:**
- Produces: `Scene.prototype.stat_chart` override that parses chart rows and calls `busPush({ kind: "statchart", rows })` instead of building `<div>`s.
- Row shapes: `{ type: "text", label, value }`, `{ type: "percent", label, value, definition }`, `{ type: "opposed_pair", label, label2, value, definition }`.

Corpus needs exactly three row types: 75 `percent`, 21 `text`, 16 `opposed_pair`. No `graphic` rows — do not build one.

- [ ] **Step 1: Write the failing test** — feed a `*stat_chart` block with one row of each type, assert three rows with correct types and values.
- [ ] **Step 2: Run and confirm it fails.**
- [ ] **Step 3: Implement** the override and the three row renderers. `percent` and `opposed_pair` render as labelled bars with `role="meter"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`.
- [ ] **Step 4: Run and confirm pass, then run fixture harness.**
- [ ] **Step 5: Commit** — `feat: add stats screen`

---

## Task 10: Achievements screen

**Files:**
- Create: `web/ui/screens/achievements.js`

**Interfaces:**
- Consumes: `nav.achievements`, `nav.achieved` (from `navigator.js`).
- Produces: `showAchievements(hideNextButton)`, `printAchievements(target)`, `checkAchievements(cb)`.

330 `*achievement` declarations and 190 `*check_achievements` calls across the corpus — the highest-value screen after the reading view.

- [ ] **Step 1: Write the failing test** — with two declared achievements, one earned, assert one renders earned with its `earnedDescription` and one renders locked with its `preEarnedDescription`, and hidden-unearned ones are masked.
- [ ] **Step 2: Run and confirm it fails.**
- [ ] **Step 3: Implement**, including the points total.
- [ ] **Step 4: Run and confirm pass, then run fixture harness.**
- [ ] **Step 5: Commit** — `feat: add achievements screen`

---

## Task 11: Saves screen

**Files:**
- Create: `web/ui/screens/saves.js`

**Interfaces:**
- Consumes: `getSaves`, `recordSave`, `computeCookie`, `restoreGame` (from `util.js`).
- Produces: `showSaves()`, and bridge handling for `*save_game` / `*restore_game`.

- [ ] **Step 1: Write the failing test** — write two slots, assert both render with their timestamps, newest first.
- [ ] **Step 2: Run and confirm it fails.**
- [ ] **Step 3: Implement** slot list, save-with-name, and restore-with-confirm.
- [ ] **Step 4: Run and confirm pass.**
- [ ] **Step 5: Commit** — `feat: add saves screen`

---

## Task 12: Settings screen

**Files:**
- Create: `web/ui/screens/settings.js`

**Interfaces:**
- Produces: `showSettings()`, `loadPreferences()`, `changeFontSize(bigger)`, `changeFontFamily(family)`, `setZoomFactor(z)`.
- Persists via `store.set` under the existing keys: `preferredZoom`, `preferredBackground`, `preferredFamily`, `preferredAnimation`, `preferredSliding`.

Reuses the existing storage keys so a player's preferences survive the upgrade.

- [ ] **Step 1: Write the failing test** — set background to `black`, assert `nightmode` on `<body>` and `preferredBackground` written to the store.
- [ ] **Step 2: Run and confirm it fails.**
- [ ] **Step 3: Implement** theme, font family (including OpenDyslexic), zoom, and animation toggles.
- [ ] **Step 4: Run and confirm pass.**
- [ ] **Step 5: Commit** — `feat: add settings screen`

---

## Task 13: Remaining UI commands

**Files:**
- Modify: `web/ui/bridge.js`

Covers the commands the fixtures use but earlier tasks did not reach: `*image` (98), `*text_image` (108), `*input_text` (68), `*input_number` (9), `*link` (17), `*bug` (324), `*feedback` (5), `*ending` (12), plus unused-but-required `*youtube`, `*sound`, `*link_button`, `*share_this_game`, `*more_games`, `*timer`, `*delay_break`, `*delay_ending`, `*kindle_image`.

- [ ] **Step 1: Write failing tests** — one per command, asserting the block or pending state it produces. `*image` must carry its `alt` text through; `*input_text` must produce a labelled `<input>`.
- [ ] **Step 2: Run and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and confirm pass, then run fixture harness.**
- [ ] **Step 5: Commit** — `feat: complete UI command coverage`

---

## Task 14: Delete dead code

**Files:**
- Delete: `web/ui.js`
- Modify: `web/mygame/index.html`, `web/index.html`

- [ ] **Step 1: Confirm** no remaining reference to any `ui.js` symbol outside `web/ui/`.
- [ ] **Step 2: Delete `ui.js`** and remove its script tag.
- [ ] **Step 3: Run the full fixture harness plus `unittest.sh`.** Must match the Task 1 baseline exactly.
- [ ] **Step 4: Commit** — `refactor: remove legacy ui.js`

---

## Task 15: Verify the export path

**Files:**
- Verify only: `compile.js`, `compile.html`

The single-file export is how games get published; a bundle that only works via `serve.js` fails the project's core constraint.

- [ ] **Step 1: Run the compiler** against a fixture game.
- [ ] **Step 2: Confirm** every `web/ui/*.js`, `web/vendor/*.js`, and `web/theme/*.css` file is inlined into the output.
- [ ] **Step 3: Open the exported file** directly and play through one choice and one `*page_break`.
- [ ] **Step 4: Commit** any fix needed — `fix: ensure new UI files are inlined by compile.js`

---

## Task 16: Accessibility pass

- [ ] **Step 1: Keyboard-only playthrough** — choices, page breaks, and all four screens reachable and operable; visible focus throughout.
- [ ] **Step 2: Verify shortcuts** J, K, 1–9, Q, W, ? still work.
- [ ] **Step 3: Verify** choices are announced as a radio group with their labels.
- [ ] **Step 4: Verify** stat bars announce as meters with values.
- [ ] **Step 5: Commit** — `fix: accessibility corrections`

---

## Self-Review

**Spec coverage:** bridge → Task 5; stubs → Task 3; theming → Task 6; four screens → Tasks 9–12; transitions → Task 8; accessibility → Tasks 7, 9, 16; command surface → Tasks 5, 9, 13; testing → Task 1 and every task's verify step; `compile.js` constraint → Task 15; `scene.js` untouched → enforced by Global Constraints, single override declared in Task 9.

**Gap found and closed:** the spec assumed the DOM was reached only through `scene.js`. Fixture `*script` blocks disprove this. Task 4 was added and the constraint promoted to Global Constraints.

**Gap found and closed:** the spec had no way to prove "no mechanical regressions". Task 1 was added first so every later task has an acceptance bar.

**Type consistency:** `bus`/`busPush`/`busSet`/`busSubscribe`/`busReset` are defined in Task 2 and used under those exact names in Tasks 4, 5, 7, 9. `bus.pending.resume` is defined in Task 5 and consumed in Task 7. Stat row shapes are defined in Task 9 and consumed only there.
