# The ChoiceScript front end

This fork replaces ChoiceScript's web front end. The scripting engine is
unchanged: every command works as before, and existing games run without edits.

## Getting started

Exactly as before:

1. Put your `.txt` scene files in `web/mygame/scenes/`
2. Run `serve.command` (macOS/Linux) or `run-server.bat` (Windows)
3. Open http://localhost:8000/web/mygame/

There is no build step. No `npm install`. Nothing to compile.

To publish, run `compile.command` / `run-compile.bat` as usual — it produces a
single self-contained `output.html` with all JavaScript and CSS inlined.

## Theming your game

Open `web/mygame/theme.css` and override any token:

```css
body {
  --cs-paper: #101014;
  --cs-ink: #E4E2DC;
  --cs-accent: #C6552F;
  --cs-font-body: Georgia, serif;
}
```

That's the whole process. No JavaScript, no build. A game with an empty
`theme.css` gets the default skin.

Every colour, size, and typeface is defined in `web/theme/tokens.css` — read
that file to see what you can change. Tokens are defined three times, once per
theme scope, so you can style light, dark, and plain-white independently:

```css
body { --cs-accent: #2F3E6B; }             /* paper (default) */
body.nightmode { --cs-accent: #93A7D9; }   /* dark */
body.whitemode { --cs-accent: #2F3E6B; }   /* plain white */
```

`web/theme/default.css` contains no literal colours. If a token override doesn't
change something, that's a bug — please report it.

## How it fits together

```
scene.js  util.js  persist.js  navigator.js     the engine, untouched
        |  (calls ~55 global functions)
        v
ui/bridge.js                                    engine calls -> bus state
        |  (bus is plain data)
        v
ui/app.js + ui/screens/*                        Preact components
        |
        v
index.html + theme/*.css
```

The engine is push-driven: it calls `printParagraph()` when it has text and
`printOptions(groups, options, callback)` when it wants an answer. The bridge
turns each call into either an append to the current screen or a *suspend* that
parks the engine's callback in `bus.pending`. Rendering is then a pure function
of `bus`, and answering a choice is just `bus.pending.resume(option)`.

| File | Responsibility |
|---|---|
| `ui/bus.js` | UI state. Plain data; no DOM, no engine knowledge. |
| `ui/bridge.js` | Implements the globals `scene.js` calls. |
| `ui/legacy.js` | Back-compat globals for authored `*script` blocks. |
| `ui/stubs.js` | No-ops for store, login, ads, platform. |
| `ui/app.js` | Components and rendering. |
| `ui/shell.js` | Title, menu, stats round-trip, preferences. |
| `ui/screens/` | Stats, achievements, saves, settings. |

## What changed for players

- Choices are numbered, and the numeral names the keyboard shortcut that selects
  it. Keys `1`–`9` work as before.
- Stat bars are real accessible meters. Screen readers announce the value; the
  old markup encoded it only in CSS width.
- Screen transitions use a crossfade instead of cloning the page. Disabled
  automatically when the reader prefers reduced motion.
- Settings, saves, and achievements are proper screens rather than dialogs.

Preferences and saved games carry over: the same storage keys are used.

## What changed for authors

Almost nothing, by design. Two things worth knowing:

**In-app purchases are stubbed.** `*purchase`, `*check_purchase`,
`*restore_purchases`, `*subscribe`, and `*advertisement` all resolve as
"already owned, free, no ads". Games using them still run; paid chapters simply
unlock. If you need real commerce, replace `ui/stubs.js`.

**Falling out of a `*choice` is allowed again.** Recent upstream ChoiceScript
throws if an `#option` block ends without `*goto` or `*finish`. Many published
games predate that rule, so it is off by default here — you get a console
warning instead. To catch it as an error while authoring:

```js
Scene.strictChoiceEnd = true;
```

## Authored `*script` blocks still work

Some published games build DOM nodes by hand inside `*script`. These remain
supported and are covered by tests:

- `document.getElementById('text')` returns the live text container
- `setClass(element, classString)`
- `printx(msg, parent)` writes to any parent node
- `document.body.classList` carries `nightmode` / `whitemode`
- `changeBackgroundColor(color)`
- `window.animateEnabled`
- the `statBar`, `statLine`, `statValue`, `opposed`, `statText` CSS classes

## Tests

```
node tools/fixture-test.js      released games via quicktest
node tools/bridge-test.js       bus, bridge, stubs, legacy contract
node tools/render-test.js       full stack in jsdom, plays a real turn
node tools/stats-test.js        stat_chart rows and meter accessibility
node tools/commands-test.js     every UI-producing command
node tools/export-test.js       compile.js output actually plays
bash unittest.sh                the engine's own test suite
```

`fixture-test.js` compares against `tools/fixture-baseline.json` rather than
requiring all-pass, so a regression is any game that got *worse*. Put game
folders in `fixtures/` (gitignored) and re-record with `--save-baseline`.
