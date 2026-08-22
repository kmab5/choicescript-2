# Product

## Register

product

Split in practice. The **reading surface** is product register: it recedes so the
author's prose is the only thing with presence. The **chrome** — choices, stats,
menus, achievements — is brand register: it carries the identity and is allowed
to be felt.

The dividing line is not decorative. Prose is the author's work; the interface
must not compete with it. Everything that is *the game rather than the story*
is ours to design.

## Users

Players of long-form interactive fiction, reading **mostly on mobile in shorter
sessions**. A ChoiceScript game runs 3–10 hours; almost nobody finishes in one
sitting. So the reader arrives mid-story, on a phone, often standing up, and
leaves mid-scene.

Consequences that follow directly:

- Resuming must be effortless and place-preserving. Losing a reader's position
  is the worst failure this interface can have.
- Interaction happens in the thumb zone, not at the top of the screen.
- Sessions are short enough that "what did I just decide?" is a real question.

Authors are the second audience: overwhelmingly non-programmers whose whole
workflow is unzip, drop `.txt` files in `scenes/`, open the page. Any change
that requires them to run a build is a change they will not adopt.

## Product Purpose

Give ChoiceScript a front end that reads like a premium ebook and plays like a
modern game, without changing the language or breaking a single published title.

Success: a reader on a phone finishes a chapter without noticing the interface,
and feels the weight of a choice when they make one. An author drops their
scenes in, picks a theme, and ships.

## Brand Personality

**Tactile. Modern. Minimal.**

The chrome behaves like a game HUD: responsive, precise, immediately legible,
with feedback that confirms every action. Minimal in the sense of *nothing
unnecessary*, not in the sense of *nothing there*. Interaction is the point of
this interface, so interaction is where the craft goes.

The reading surface has the opposite personality: quiet, warm, still. This is
deliberate contrast, not inconsistency.

## Anti-references

- **Skeuomorphic book.** No page curl, no leather, no parchment texture, no
  faux page edges. This is not a simulation of a paperback.
- **Anything that removes the interactivity of the game.** The hardest rule
  here. Interactive fiction is a *game*; a front end that presents it as a
  document with buttons attached has failed. Choices are the mechanic, not a
  form to fill in. If a design decision makes the game feel more like reading a
  page and less like playing, it is wrong.

## Design Principles

1. **The choice is the game.** It gets the most design attention and the most
   feedback. Everything else can be quiet.

   Choices are select-then-confirm: a native radio group plus a submit. This is
   deliberate and settled. A choice in interactive fiction is a *decision*, and
   a decision deserves the beat before it commits — a mis-tap that silently
   branches the story is far worse than one extra tap. It also keeps the whole
   screen-reader story riding on native form semantics.

   Presence comes from feedback within that flow, not from removing steps.
2. **Prose is the author's, not ours.** The reading surface carries no styling
   that competes with the writing. Restraint here is what earns presence
   elsewhere.
3. **Thumb-first.** Mobile short sessions are the default case, not the
   responsive afterthought. Targets, sheet placement, and reach are designed for
   a phone held one-handed.
4. **Never lose the reader's place.** Overlays sit above the story; the story
   never unmounts. Resuming is exact.
5. **Nothing an author has to build.** No npm, no bundler, no compile step. A
   design that costs authors a toolchain is not shippable here.

## Accessibility & Inclusion

**WCAG 2.1 AA** across every theme and both brightness scopes.

- Body text ≥ 4.5:1, large text ≥ 3:1, in all six themes, light and dark.
- Touch targets ≥ 44×44px with ≥ 8px separation.
- Pinch-zoom never disabled.
- Full keyboard operation, visible focus, and the existing 1–9 shortcuts.
- Choices announce as a labelled group; stat bars announce as meters with values.
- `prefers-reduced-motion` respected by every animation.
- OpenDyslexic ships and is a first-class typeface option, not a fallback.
