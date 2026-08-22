# Canonical shell

`index.html` here is the source of truth for the game shell. `web/mygame/index.html`
is a copy of it.

Published ChoiceScript games ship their own `mygame/index.html` that loads the
OLD runtime (`../ui.js`, `../style.css`, `../alertify.min.js`). Copying such a
game folder in wholesale replaces the shell with one that references deleted
files — the page dies at runtime, and `compile.js` produces a large but
completely inert HTML file.

So `compile.js` and `tools/import-game.js` both detect a legacy shell and fall
back to this file.
