# ChoiceScript Front-End Overhaul — LOG

Running record of what has been built and what is planned.
Spec: `docs/superpowers/specs/2026-08-19-choicescript-frontend-overhaul-design.md`
Plan: `docs/superpowers/plans/2026-08-19-choicescript-frontend-overhaul.md`

---

## Status

| Task | Description | Status |
|---|---|---|
| — | Codebase survey | Done |
| — | Design spec | Done |
| — | Implementation plan | Done |
| — | Vendor Preact + htm | Done |
| — | Legacy choice fallthrough fix | **Done** |
| 1 | Fixture test harness | **Done** |
| 2 | The bus | **Done** |
| 3 | Commerce stubs | **Done** |
| 4 | Legacy DOM compatibility | **Done** |
| 5 | The bridge | **Done** |
| 6 | Theme tokens + default skin | **Done** |
| 7 | App shell + choice rendering | **Done** |
| 8 | Screen transitions | **Done** |
| 9 | Stats screen | **Done** |
| 10 | Achievements screen | **Done** |
| 11 | Saves screen | **Done** |
| 12 | Settings screen | **Done** |
| 13 | Remaining UI commands | **Done** |
| 14 | Delete `ui.js` | **Done** |
| 15 | Verify export path | **Done** |
| 16 | Accessibility pass | Not started |

---

## Built so far

### Codebase survey
Mapped the engine/UI seam. `scene.js` (5,063 lines) never renders directly — it
calls ~55 global functions. `headless.js` and `randomtest.js` already stub ~25 of
them and run the interpreter with no DOM, proving the seam holds.

Measured `ui.js` (4,163 lines): ~36% is the reading experience, ~63% is store,
login, ads, and per-platform shims (`window.isIosApp` alone appears 46 times).

### Design spec
Approved. Key decisions: `scene.js` unmodified; commerce replaced by ~60 lines of
no-op stubs rather than deleted; screen boundaries preserved; Preact + htm as
classic UMD scripts so `compile.js` keeps working.

### Vendored renderer
`web/vendor/preact-htm.umd.js` — Preact 10.29.8 + htm 3.1.1 standalone build.
13 KB raw, 5.4 KB gzipped. Exposes global `htmPreact` with `html`, `render`, and
the full hooks API. Loaded by a plain `<script src>` tag, so `compile.js` inlines
it unchanged and authors never run a build.

---

## Findings from the fixture games

Five released games unpacked into `fixtures/` (gitignored).

**Command usage across all five:**

| Command | Uses | Games |
|---|---|---|
| `*page_break` | 3,505 | 5/5 |
| `*line_break` | 752 | 5/5 |
| `*achievement` | 330 | 5/5 |
| `*bug` | 324 | 1/5 |
| `*finish` | 219 | 5/5 |
| `*check_achievements` | 190 | 4/5 |
| `*text_image` | 108 | 3/5 |
| `*image` | 98 | 4/5 |
| `*input_text` | 68 | 5/5 |
| `*stat_chart` | 64 | 5/5 |
| `*check_purchase` | 17 | 5/5 |
| `*link` | 17 | 1/5 |
| `*subscribe` | 15 | 5/5 |
| `*ending` | 12 | 5/5 |
| `*input_number` | 9 | 2/5 |
| `*feedback` | 5 | 5/5 |
| `*page_break_advertisement` | 5 | 5/5 |
| `*save_game` | 1 | 1/5 |

Unused by any fixture but still required for other games: `*youtube`, `*sound`,
`*kindle_image`, `*link_button`, `*more_games`, `*purchase`,
`*restore_purchases`, `*save_checkpoint`, `*restore_checkpoint`, `*restore_game`,
`*login`, `*show_password`, `*print_discount`, `*advertisement`, `*timer`,
`*delay_break`, `*delay_ending`, `*share_this_game`.

**`*stat_chart` row types:** 75 `percent`, 21 `text`, 16 `opposed_pair`, 0
`graphic`. Three renderers needed, not four.

**Plan-changing discovery: authored `*script` blocks touch the DOM directly.**
Games call `document.getElementById('text')`, `setClass`, `printx(msg, parent)`,
`document.body.classList.contains("nightmode")`, `changeBackgroundColor(...)`,
and write `window.animateEnabled`. The engine respects the seam; authored content
does not. Task 4 (legacy compatibility layer) was added to the plan as a result,
and these globals were promoted to hard constraints.

**Verification gap closed:** the spec had no mechanism to prove "no mechanical
regressions". Task 1 (fixture harness) was added and ordered first so every
later task has a concrete acceptance bar.

**Security note (not front-end work):** all five zips contain
`AppstoreAuthenticationKey.pem`, an App Store Connect private key. Gitignored
here and untouched. Should be rotated.

---

### Task 1 — fixture test harness
`tools/fixture-test.js` swaps each fixture's `mygame/` into `web/mygame/`, runs
quicktest, and restores the original. Compares against a recorded baseline
(`tools/fixture-baseline.json`) rather than requiring all-pass, so a regression
is any game that got *worse*.

**Baseline: 3/5 pass.** `fool` and `hero-vs-villain-genesis` fail on the current
engine for reasons unrelated to the front end — see Known issues below.

### Tasks 2–5 — bus, stubs, legacy layer, bridge
552 lines replacing the ~4,163-line `ui.js`.

- `web/ui/bus.js` (89) — plain state object plus subscribe/notify. No DOM, no
  engine knowledge.
- `web/ui/stubs.js` (125) — commerce/platform no-ops. Everything owned, nothing
  costs money, nobody signed in.
- `web/ui/legacy.js` (106) — `printx`/`println`/`printParagraph` with the dual
  parent/bus behaviour, plus `setClass`, `changeBackgroundColor`, `isNightMode`.
  This is what keeps shipped games' custom stat bars working.
- `web/ui/bridge.js` (232) — implements the engine globals. Every call becomes
  an append or a suspend that parks a resume callback.

`tools/bridge-test.js` drives the real engine globals through a minimal DOM shim:
**22 assertions passing**, covering choices, page breaks, `clearScreen`
archiving, text input, image alt-text, purchase stubs, and the authored
`*script` DOM contract. Fixture harness: 0 regressions.

### Legacy choice fallthrough — backwards compatibility fix
**This is the one change to `scene.js`**, made at the user's direction and
recorded as a spec amendment.

The current engine computes `allowFallthrough` when a `*choice` is parsed and
writes `0` into `_choiceEnds` when an option ends without `*goto`/`*finish` and
`implicit_control_flow` is off. `printLoop` then throws on that sentinel. Older
engines had no sentinel — `_fakeChoiceDepth` and a truthiness check gated the
skip, and execution simply continued onto the next line.

The correlation was exact: `choice-of-magic` sets
`*create implicit_control_flow true` and passed; `fool` and
`hero-vs-villain-genesis` never set it and failed.

The throw is now gated behind `Scene.strictChoiceEnd`, default `false`:
- `false` — legacy fallthrough with a one-time `console.warn` per offending
  line. Every released game runs.
- `true` — the modern authoring error, useful for new games.

**Fixture pass rate: 3/5 → 5/5.** 177 engine unit tests still pass. Baseline
re-recorded at 5/5, so any future regression is caught.

### Task 8 — screen transitions
The `container1`/`container2` clone, `translateY(pageYOffset)` and
`scrollTo(0,1)` URL-bar hack are gone. The pane is keyed on screen index so
Preact replaces the subtree on each `clearScreen`, restarting the entrance
animation; `document.startViewTransition` supplies a real crossfade where
supported. Disabled by `window.animateEnabled === false` (which fixture
`*script` blocks set) and by `prefers-reduced-motion`.

### Task 9 — stats screen
`web/ui/screens/stats.js` holds the project's single `Scene.prototype` override.
`stat_chart` now emits structured rows instead of hand-built `<div>`s, so bars
render with `role="meter"`, `aria-valuenow/min/max`, and `aria-valuetext` naming
both sides of an opposed pair.

`tools/stats-test.js`: **13 assertions passing** against a real chart with all
three corpus row types — text values, percent values, definitions, opposed-pair
labels, meter roles, and fill width matching the stat value.

---

## Known issues

**App Store credential in fixture zips.** All five contain
`AppstoreAuthenticationKey.pem`. Gitignored and untouched here. Should be
rotated in App Store Connect.

---

### Tasks 6–7 — theme layer and app shell
The front end now renders. 1,500 lines total replacing 4,757 (`ui.js` +
`style.css`).

- `web/theme/tokens.css` — every colour, size and face as a custom property,
  across three scopes (default, `.nightmode`, `.whitemode`) plus the `.sans` /
  `.dyslexia` reader preferences.
- `web/theme/default.css` — the skin. No literal colours: overriding tokens is
  enough to reskin a game.
- `web/ui/app.js` — Preact components. Choices render as a real `<form>` with
  `<input type="radio">` and `<label>`, preserving the native screen-reader
  behaviour the old UI depended on.
- `web/ui/shell.js` — title/author, the stats round-trip, menu, and preference
  loading against the existing store keys.
- `web/mygame/theme.css` — empty by default; where an author overrides tokens.

**Design direction:** ink on paperback stock. Paper is greyer and cooler than
the old `#F7F4F1` cream so long passages sit back instead of glowing; the accent
is a deep ink-indigo rather than warm clay. Body face prefers Iowan Old Style
and Charter (text faces cut for long-form reading, shipping on macOS/iOS) with
Constantia covering Windows. No new webfonts — `compile.js` inlines scripts but
not binary font files, and breaking the single-file export for typography is not
a trade worth making.

**Signature element:** the choice list. Numbered, numeral hanging in the margin
in the accent colour. This is honest structure rather than decoration — the
engine already assigns keyboard shortcuts 1–9, so the numerals name real keys.
They carry `aria-hidden` so screen readers hear the option text, not the digit.

`tools/render-test.js` runs the whole stack in jsdom and plays a real turn of
the sample game: **17 assertions passing**, covering mount, prose rendering,
advancing through page breaks, reaching a choice, native radio/label structure,
selecting an option, screen advance, and the authored `*script` DOM contract.

**Bug found and fixed by that test:** the bus subscription was registered inside
a Preact `useEffect`, which is deferred until after paint. The engine runs
synchronously the moment it starts, so every `busNotify` from the opening scene
fired before any subscriber existed and the first screen rendered empty. The
subscription now lives in `appMount`, outside the component lifecycle.

---

### Tasks 10–12 — achievements, saves, settings
- `screens/achievements.js` — three states per achievement (earned; locked and
  visible; locked and hidden, which is counted but never revealed). Earned set
  is persisted to storage as achievements fire, so the screen shows lifetime
  progress rather than just this session.
- `screens/saves.js` — slot list newest-first over `getSaves` / `recordSave` /
  `restoreGame`. Storage contract unchanged.
- `screens/settings.js` — theme, typeface (including OpenDyslexic), text size,
  transitions. Persists under the SAME store keys as the old UI
  (`preferredBackground`, `preferredFamily`, `preferredZoom`,
  `preferredAnimation`), so a player's settings survive the upgrade.

### Task 13 — command coverage
`tools/commands-test.js`: **12 assertions passing**, each running a real command
through the engine — `*image`, `*text_image` (alt text and invert),
`*line_break`, `*page_break`, `*input_text`, `*input_number`, `*achievement` +
`*achieve`, `*check_purchase` unlocking gated content, `*ending`, `*link`,
`*stat_chart`, `*title`/`*author`. No engine-called global is undefined.

### Task 15 — export path verified
**A pre-existing bug was blocking this.** `compile.js` declares `var rootDir` at
module scope, but loads `mygamegenerator.js` through `vm.runInThisContext`,
which runs in the *global* context — so `rootDir` was invisible and the Node
compile path crashed. Confirmed against stock upstream at `60a6c3e`: it fails
identically there, so this predates the overhaul. Fixed by publishing
`global.rootDir` before loading.

`tools/export-test.js` now runs `compile.js` and plays the exported file:
**self-contained, zero external references, 634 characters of prose rendered,
title set, Next button live.**

### Task 14 — legacy front end removed
Deleted `web/ui.js` (4,163), `web/style.css` (594), and `alertify` (both files).
Before deleting, updated the two remaining consumers — `editor/blankgame.html`
and `web/mygame/credits.html` — to load the new stack. All three `alertify`
call sites in `scene.js` and `util.js` are `typeof`-guarded, so dropping it is
safe.

**2,100 lines of new front end replacing 4,768 lines removed.**

---

## Test suites

| Suite | Covers | Result |
|---|---|---|
| `tools/fixture-test.js` | 5 released games, quicktest | 5/5, 0 regressions |
| `unittest.sh` | engine unit tests | 177 passed |
| `tools/bridge-test.js` | bus, bridge, stubs, legacy contract | 22 passed |
| `tools/render-test.js` | full stack in jsdom, real turn played | 17 passed |
| `tools/stats-test.js` | stat_chart rows and meter accessibility | 13 passed |
| `tools/commands-test.js` | every UI command the corpus uses | 12 passed |
| `tools/export-test.js` | compile.js single-file export plays | PASS |

---

### Round 2 — bugs from manual playthrough of Choice of Magic

All five reported symptoms reproduced, diagnosed, and covered by
`tools/regression-test.js` (18 assertions).

**Authored `*script` nodes rendered at the page edges and carried over.**
Published games do `target = document.getElementById('text'); …;
target.appendChild(div)`. Preact owns `#text`, so raw appends landed after
everything drawn and then survived the next diff. `appendChild` / `insertBefore`
are now intercepted: authored nodes become positioned blocks in the render
stream and clear on screen change. A second layer: the engine buffers prose in
`accumulatedParagraph`, so a node could still land *before* text written above
it — the interceptor flushes that buffer first.

**Literal "undefined" under images.** `*line_break` calls `println()` with no
argument when the paragraph buffer is empty, which is exactly the case after
`*text_image`. `String(undefined)` printed it. Null-guarded.

**Stats → Saves → Stats left Next dead.** The old design swapped `bus.screen`
and stashed return state, which the round trip clobbered. Screens are now
**overlays**: dialogs above a story that never unmounts, with stats rendering
into a separate `statsBlocks` channel. Closing is "stop showing it" — no state
to restore, nothing to desync.

**`stat_chart` override missed `screenEmpty = false`.** Exposed by the fix
above: the engine thought the stats page was blank, so `*finish` closed the
overlay before anything rendered. Now matches stock (`prevLine = "block"`).

**`window.reportError` was deleted with `ui.js`.** It is ChoiceScript's *own*
error reporter, called unguarded from `util.js`. The missing-globals scan missed
it because it is called as `window.reportError(...)`. Any engine error threw a
secondary TypeError inside the error handler and killed the page silently.
Reinstated, rendering errors inline instead of `alert()`. This is what then
surfaced the compile bug below.

**Compile failed for published games — two causes.**
1. Games ship their own `mygame/index.html` pointing at the old runtime.
   `tools/import-game.js` now imports scenes and media while keeping the shell,
   and refuses to copy credential files.
2. `compile.js` bundled only scenes named in `*scene_list`, so scenes reached by
   `*gosub_scene` (`utils.txt`) were missing → "Couldn't load scene". It now
   bundles every scene file present, and warns instead of crashing on a missing
   stylesheet.

Verified end to end by `tools/import-compile-test.js`: import → compile → load
→ click through. Passes for both `martian-job` and `choice-of-magic`.

### Round 2 — features

- **Six themes** (Paperback, Terminal, Nocturne, Manuscript, Newsprint, Ember)
  in `theme/themes.css`, each redefining tokens across all three brightness
  scopes so they survive a game calling `changeBackgroundColor`.
- **Six typefaces**, line-width control, text size, motion toggle, and
  restart-with-confirmation.
- **Main menu overlay**: Continue / Saved games / Stats / Achievements /
  Settings / Restart.
- **Saves screen** now has a working name-and-save control, not just a list.
- **Favicon** probes for a game icon, falls back to the bundled ChoiceScript
  submark in `web/images/`.

---

## Test suites

| Suite | Covers | Result |
|---|---|---|
| `tools/fixture-test.js` | 5 released games, quicktest | 5/5, 0 regressions |
| `unittest.sh` | engine unit tests | 177 passed |
| `tools/bridge-test.js` | bus, bridge, stubs, legacy contract | 22 passed |
| `tools/render-test.js` | full stack in jsdom, real turn played | 17 passed |
| `tools/stats-test.js` | stat_chart rows and meter accessibility | 13 passed |
| `tools/commands-test.js` | every UI command the corpus uses | 12 passed |
| `tools/regression-test.js` | bugs from manual playthrough | 18 passed |
| `tools/export-test.js` | compile.js single-file export plays | PASS |
| `tools/import-compile-test.js` | import → compile → play | 10 passed |

---

## Still open

**Task 16 — accessibility pass.** Not done, and not claimable from automated
checks. jsdom verifies structure (native radios with labels, `role="meter"`
with values, `aria-hidden` numerals) but cannot judge focus order, or how a
screen reader actually announces a choice. Needs a real browser.

**Design brief.** The impeccable skill requires an interview before writing
PRODUCT.md; synthesising one from the task prompt is explicitly disallowed. The
six themes are built on the existing token system, not on a confirmed design
direction. A proper critique pass needs ~2 rounds of questions first.

**Save system** works in jsdom round-trip tests but has not been verified in a
real browser against real storage.

**App Store credential** in the fixture zips should still be rotated.
