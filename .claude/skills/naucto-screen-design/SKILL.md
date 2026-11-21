---
name: naucto-screen-design
description: Working method for designing or restyling a Naucto screen or an nc-* kit component. Use when asked to design, redesign or restyle a screen or a kit component, when a change touches a screen the design does not draw, or when the user asks for mock-ups or variants to choose from.
---

# Designing a Naucto screen

`AGENTS.md` at the repo root is the authority and is not repeated here. Read, before anything else,
its **Design rules**, the **Pixel kit** and **Theming** paragraphs of Architecture, **Deliberate
divergences from the design** and **Gotchas**. A mock-up answers to them exactly as the app does.

## 1. Find what exists

- **The design.** The canvas is `fixtures/naucto-redesign.html` in the Design2Code checkout beside
  this repo (`npm run design:check` reads it; `D2C=<path>` points elsewhere). Look for the artboard
  of the screen and for the foundations board. What the app leaves out on purpose is listed under
  "Deliberate divergences" in `AGENTS.md`; what it has not drawn yet is in
  `tools/design-coverage.json`.
- **The kit.** `/ui-kit` (`apps/web/src/app/features/ui-kit/`) shows every `nc-*` component in
  both themes; `packages/ui/src/index.ts` lists them, `packages/ui/src/tokens.css` holds the
  tokens and the bevel utilities. Composites live in `apps/web/src/app/shared`.
- **The neighbours.** Open a built screen of the same family (a hub shelf, an editor inspector, a
  dialog) and take its grid, its paddings and its components before inventing any.

A screen composes the kit, down to its smallest element: before building a count, a person, a
state or a title, find the piece on `/ui-kit` that already draws it. If none fits, the piece is
added to the kit and shown on `/ui-kit`, not drawn once in the screen.

A glyph is drawn for the size it is shown at, on a grid whose cell is one kit pixel (3px): an
`nc-mark` is five cells (15px), and a mark of another size is drawn on its own grid of 3px cells.
An `nc-icon` is 18 beside words or 24 standing alone, each its own drawing in
`packages/ui/src/icons/`, and is never scaled to fit a control. A control's frame keeps one pixel
clear of its glyph: a mark at 30, an icon of 18 at 36, one of 24 from 40.

A title on a fixed-width plate stays on **one line**: squeezed horizontally down to a floor of
0.62, and only then cut with an ellipsis, as the design's fitted titles are (`squeeze` in
`apps/web/src/app/shared/game-card/floppy.component.ts`). It is never wrapped onto a second line
to make it fit.

## 2. Implement, or iterate first

Implement directly when the design draws the screen and the kit has the pieces.

Propose a mock-up round when the design does not draw the screen, when it draws it in a way a
design rule forbids, or when the look would take back-and-forth to settle. Say so to the user in
one or two lines (what is undecided, how many versions you would show) and wait for their answer.
No mock-up is built before they agree, and nothing is implemented before they pick.

## 3. Run a mock-up round

1. **A dev-only route.** `mock/<name>` beside `ui-kit` in `apps/web/src/app/app.routes.ts`, inside
   the same `ngDevMode` block, loading `features/mock/<name>/mock-<name>.page.ts`. The page reads
   three query parameters: `s` the screen, `v` the variant (`a`, `b`, `c`), `state` the state
   (filled, empty, long title, error). Every capture is then one URL:
   `/mock/<name>?s=page&v=b&state=empty`.
2. **The real kit, on fixtures.** Variants are Angular components built from `nc-*` components and
   tokens, fed by a `fixtures.ts` in the same folder. No backend, no hand-drawn look-alike of a kit
   component, no image of a screen.
3. **Variants differ in structure.** A table against cards, a panel against a page, one step
   against two. Two versions that differ by a colour or a padding are one version. Three is the
   usual number.
4. **Every state that changes the layout**: empty, one item, many, the longest title, the error.
5. **Capture with Playwright** against your own dev server: each variant and state in dark and in
   light at 1440 wide, and at phone width (390). Set the theme before load
   (`localStorage['naucto.theme']` in an init script) and never capture right after flipping it.
6. **Look at every capture** before showing any. Fix what is cramped, misaligned, clipped or off
   the 3px grid, and capture again. A capture nobody opened proves nothing.
7. **Publish an artifact**: per screen, the variants side by side, each with its captures, what it
   is in one line and its trade-off (what it costs, what it cannot do). End with one
   recommendation and its reason.
8. **The user picks**, mixes two, or asks for another round. Repeat from 2 with what they said.

The mock route and its folder do not ship: delete them in the change that implements the pick,
unless the user asks to keep them.

## 4. Implement the pick

- Strings go through Transloco (`apps/web/public/i18n/en.json`); a key that dies is removed.
- Fixtures become real queries and stores; every state the mock-up drew gets a real path to it.
- A deliberate gap between the design and what was picked is written under "Deliberate
  divergences" in `AGENTS.md`, with its reason.

## 5. Verify

1. `npm run lint && npm run typecheck && npm test`
2. `npm run pixel:check && npm run i18n:check && npm run format:check`
3. A dev server of your own: `npx ng serve web --port <free port>`. Port 3001 is the shared
   default and may be serving another tree.
4. The e2e specs of the screens you touched, by name:
   `E2E_BASE_URL=http://localhost:<port> npx playwright test --project=chromium <specs>`. A spec
   that asserted the old markup or strings is updated in the same change.
5. Capture the implemented screen as in step 3.5, stubbing the backend the way the specs do
   (`e2e/fixtures.ts`, `e2e/mocks/`), and look at the captures. Lint, typecheck and unit tests see
   neither a template's layout nor a theme.
6. Stop the dev server.

Report what was built, the check results, and the path of every capture.
