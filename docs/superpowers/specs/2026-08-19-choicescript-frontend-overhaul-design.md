# ChoiceScript front-end overhaul — design

Date: 2026-08-19
Status: approved, pending implementation plan

## Goal

Replace the ChoiceScript web front end with a modern, themeable one, without
changing the scripting engine or breaking any authored game. Success means an
existing released game runs on the new front end with no edits to its scene
files and no behavioural difference in its mechanics.

## Constraints

1. **Zero build step for authors.** The workflow stays: drop `.txt` files into
   `web/mygame/scenes/`, run `serve.command`, play. An author must never run
   `npm install` to see their own game.
2. **`compile.js` must keep working.** It produces the single publishable HTML
   file by regex-scraping `<script src="...">` tags out of `index.html` and
   inlining their contents. It has no concept of `import`. This rules out ES
   modules and bundlers; it does not rule out a component model.
3. **`scene.js` is minimally modified.** Originally zero forked lines. Amended
   2026-08-19 at the user's direction: one backwards-compatibility change was
   required (see "Legacy choice fallthrough" below). The engine is otherwise
   reached only through the global functions it already calls.
4. **No mechanical regressions.** `quicktest` and `randomtest` pass after every
   pass, against real released games as fixtures.

## Architecture

The engine never talks to the DOM directly — it calls roughly 55 global
functions. `headless.js` and `randomtest.js` already stub about 25 of them and
run the full interpreter with no DOM, which proves the seam holds. The new front
end is a third implementation of that same interface.

```
scene.js  util.js  persist.js  navigator.js     ← untouched, upstream-mergeable
        ↓ (global function calls)
ui/bridge.js                                    ← engine calls → bus state
        ↓ (bus is plain data)
ui/app.js + ui/screens/*                        ← Preact components
        ↓
index.html + theme/*.css
```

### Renderer

Preact + htm, vendored as classic UMD scripts (`window.preact`, ~4KB gzipped;
htm ~700 bytes). This gives a real component model with JSX-like tagged
templates and no compile step:

```js
html`<${Choice} options=${bus.pending.options} onPick=${bus.pending.resume} />`
```

Both load via ordinary `<script src>` tags, so `compile.js` inlines them like
any other file. Vanilla custom elements is the fallback if we later want zero
dependencies; the bridge is unchanged either way, which is what makes the
decision reversible.

### File layout

```
web/
  scene.js  util.js  persist.js  navigator.js   ← untouched
  vendor/preact.umd.js  vendor/htm.umd.js
  ui/
    bridge.js        ~150 lines: engine globals → bus
    stubs.js         ~60 lines: commerce no-ops
    app.js           root component, renders bus state
    screens/         stats.js, saves.js, settings.js, achievements.js
  theme/
    tokens.css       every colour/size/font as a custom property
    default.css      the new default skin
  mygame/
    scenes/*.txt     author drops files here
    theme.css        optional per-game token overrides
fixtures/            licensed test games — gitignored, never committed
```

## The bridge

Every engine call becomes either an append to the current screen or a suspend
that parks a resume callback.

| Engine calls | Bridge does |
|---|---|
| `printParagraph` / `println` / `printx` | append to `bus.blocks` |
| `printImage`, `printYoutubeFrame`, `playSound` | append typed block |
| `clearScreen(code)` | push screen to history, reset `blocks`, run `code()` |
| `printOptions(groups, options, cb)` | `bus.pending = {kind:"choice", …, resume: cb}` |
| `printButton(name, …, cb)` | `bus.pending = {kind:"next", …, resume: cb}` |
| `printInput`, `printCheckboxes` | `bus.pending = {kind:"input"/"checkboxes", …}` |
| `startLoading` / `doneLoading` | `bus.loading` |
| `asyncAlert` / `asyncConfirm` | `bus.modal` |
| `achieve(name, title, desc)` | toast + record |

Rendering is a pure function of `bus`. Answering a choice is
`bus.pending.resume(option)`.

### Why `scene.js` needs no edits

The commands that appear to touch the DOM (`*input_text`, `*save_game`, error
paths) all resolve `var target = this.target; if (!target) target =
document.getElementById('text')`. Assigning `scene.target` to a node the bridge
owns means none of them reach for a global. That leaves exactly one override —
`Scene.prototype.stat_chart`, so the stats screen consumes structured data
instead of hand-built `<div>`s. `randomtest.js` already overrides that same
method, so this is a sanctioned pattern, not a fork.

## Legacy choice fallthrough

**Spec amendment, 2026-08-19.** The original constraint was zero modified lines
in `scene.js`. Testing against released games showed that constraint conflicts
with the project's actual goal, and the user chose backwards compatibility.

The current engine computes `allowFallthrough` when a `*choice` is parsed and
writes `0` into `_choiceEnds` when an option ends without `*goto`/`*finish` and
`implicit_control_flow` is off. `printLoop` then throws on that sentinel. Older
engines had no sentinel — `_fakeChoiceDepth` and a truthiness check gated the
skip, and execution simply continued onto the following line.

Two of five fixture games (`fool`, `hero-vs-villain-genesis`) never set
`implicit_control_flow` and rely on that fallthrough. They were unplayable on
the current engine before this change, and no front-end work could fix it.

The throw is now gated behind `Scene.strictChoiceEnd`, default `false`:

- `false` (default) — legacy fallthrough, with a one-time `console.warn` per
  offending line. Every released game runs.
- `true` — the modern authoring error, for new games where falling out of a
  choice is almost always a mistake.

Result: fixture pass rate went from 3/5 to 5/5, with 177 engine unit tests still
passing. No other `scene.js` behaviour is altered.

## Commerce stubs

`scene.js` guards only 9 of its global calls with `typeof` checks; the commerce
ones mostly are not guarded. Deleting `purchase`, `getPrice`, `loginForm`, and
`showFullScreenAdvertisementButton` would hard-crash any game using `*purchase`,
`*check_purchase`, `*restore_purchases`, `*subscribe`, or `*advertisement`.

So the ~2,600 lines of store, login, ads, and platform code are replaced by ~60
lines of honest no-ops:

- `checkPurchase` → already owned
- `getPrice` → free
- `isRegistered` → false
- `showFullScreenAdvertisementButton` → invoke callback immediately

Every existing game keeps running and paid chapters simply unlock. This is
better compatibility than deletion, at 2% of the code.

Achievements are **not** commerce. `*achieve` and `*check_achievements` are
ordinary story features and get a redesigned screen, not a stub.

## Reading model

Screen boundaries are preserved. The engine persists only
`{stats, temps, lineNum, indent}` — there is no transcript — so on reload it
replays from `lineNum` and reproduces exactly one screen. Continuous scroll
would drop a resumed save into an empty buffer with no history above it, which
reads as a bug, and would require persisting a transcript alongside the save:
a second source of truth that can drift. `*page_break` is also an authorial
pacing instrument; removing it silently rewrites the rhythm of every existing
game.

What gets replaced is the *implementation*. `clearScreen` currently clones
`container1.innerHTML` into a second container, applies `translateY` equal to
`pageYOffset`, then calls `scrollTo(0,1)` to hide mobile URL bars. That is
replaced by two stacked panes with a real crossfade (View Transition API where
available), gated on `prefers-reduced-motion`.

Deletions while in there: the `noAjax` form-POST fallback, and the ~80-line
swipe-to-select touch shuttle in `printOptions`.

Addition: a **history drawer** — previous screens from this session, read-only,
opened on demand. Gives back "what did I just choose" without making the
transcript load-bearing for save/restore.

## Accessibility

The current UI has zero ARIA attributes and gets its entire screen-reader story
from native `<form>` + radio + `<label>` semantics, plus the deliberate
double-`requestAnimationFrame` focus dance in `focusFirst`. Both are preserved.
Choices render as real form controls, not `<div onClick>`.

Baseline requirements: visible focus states, WCAG AA contrast in both themes,
full keyboard operation, and the existing keyboard shortcuts (J/K, 1–9, Q, W, ?)
kept working.

## Theming

`theme/tokens.css` defines every colour, size, and font as a custom property.
`theme/default.css` is the new default skin. An author overrides tokens in
`mygame/theme.css` — no JavaScript, no build. A game with no `theme.css` gets
the default skin.

## Screens to rebuild

1. **Stats** — bars and meters from structured `stat_chart` data, as a panel.
2. **Saves** — slot list with timestamps, replacing the current form.
3. **Settings** — night mode, OpenDyslexic, zoom, animation. The features from
   the existing 531-line `loadPreferences` survive; the implementation does not.
4. **Achievements** — locked/unlocked states, points, descriptions.

## Command surface

84 commands total; 36 produce UI output and must be covered by the bridge:

`*image` `*text_image` `*kindle_image` `*sound` `*youtube` `*link`
`*link_button` `*input_text` `*input_number` `*stat_chart` `*page_break`
`*line_break` `*finish` `*ending` `*achievement` `*check_achievements`
`*share_this_game` `*more_games` `*feedback` `*bug` `*save_game`
`*restore_game` `*restore_checkpoint` `*save_checkpoint` `*purchase`
`*check_purchase` `*restore_purchases` `*subscribe` `*login` `*show_password`
`*print_discount` `*advertisement` `*page_break_advertisement` `*timer`
`*delay_break` `*delay_ending`

The remaining 48 are control flow, state, and metadata; they never reach the
front end and are covered by leaving `scene.js` alone.

## Testing

- `quicktest` and `randomtest` pass on every fixture game after each pass.
- Per-command manual checklist across the 36 UI-producing commands.
- Save/restore round-trip: save mid-game, reload, confirm identical screen.
- Keyboard-only and screen-reader pass on the choice screen and all four
  rebuilt screens.

## Out of scope

- Any change to `scene.js` behaviour or the ChoiceScript language.
- Modernising `persist.js` (1,766 lines across seven storage backends). Its
  abstraction boundary is kept intact so native targets stay possible later.
- iOS / Android / Steam packaging.
