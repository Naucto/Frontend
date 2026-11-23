---
name: naucto-editor-modes
description: Working method for any change inside the Naucto editor (CODE, ART, MAP, SOUND, NET, GAME, the editor shell, the work session, EditableGame). Use when adding or changing an editor tab, a write to the game document, a kit control or a canvas tool used in the editor, anything about read-only, staff or suspended access to a game, or when building the diff mode.
---

# Working on a Naucto editor

`AGENTS.md` at the repo root is the authority and is not repeated here. Read its **Editor modes**
section first, then **Architecture** (Game document shape, Editor layout, Moderation › A game
looked at) and **Gotchas**. This file is the order to do things in.

Every editor is read without being written. A change that adds a way to write and does not put
it behind one of the three doors is a bug, whatever mode it was tested in.

## 1. Know where the mode comes from

- `EditorModeService` (`apps/web/src/app/features/editor/state/editor-mode.service.ts`) holds it,
  provided by `editor-shell.component.ts`. Ask `mode.canWrite()` and nothing else.
- It is **imposed** by `WorkSessionService.open`
  (`features/editor/work-session/work-session.service.ts`) when the account may only look: that
  method alone decides between the live session and the game loaded once.
- Do not read `session.preview()`, the account's role or its suspension to decide whether
  something may be written. They say why a band is shown, not what an editor may do.

## 2. Add or change a tab

1. Route it in `features/editor/editor.routes.ts`, under the shell. The shell's
   `[ncDisabledScope]` closes its kit controls; add no scope of your own.
2. Inject `EditorModeService` as `mode` where the template or a handler needs it.
3. Let through what only looks, with `ncLooksOnly` (import `LooksOnlyDirective`): the strips
   that navigate, the zoom, the view toggles, the transport, copy. On a control it lets that
   control through; on a `div` it lets through every control under it. When in doubt, leave it
   closed.
4. A strip of tabs that also renames, removes or reorders: `ncLooksOnly` on the strip, and
   `editable`, `removable`, `reorderable` bound to `mode.canWrite()`.
5. Add the tab to `e2e/editor/read-only.spec.ts`.

## 3. Add a write

- **To the game document.** Write it as a method of `EditableGame`
  (`packages/engine/src/game/EditableGame.ts`) whose body is inside `this.transact(...)`, or call
  `game.transact(() => ...)` from the editor. Never `doc.transact`, never a bare `set`, `delete`
  or `insert` on a Yjs type outside the gate. Give a new method its line in `MUTATORS` in
  `packages/engine/src/game/gate.test.ts`: a call that changes a seeded document. A method that
  answers something answers `null` or `false` when the gate refuses; make the caller check.
- **A text field on a `Y.Text`.** `yTextField(game, text)` (`shared/yjs/y-signal.ts`).
- **To the API.** Call the generated client from the component, behind a kit control. Add no
  wrapper and no interceptor: the server refuses, the closed control keeps the call from being
  made.
- **Opening is not editing.** What a load writes goes through `Y.applyUpdate` or the session's
  own `remote-init` transaction, and a migration through `migrateGame`. Do not route an edit
  that way to get round the gate.

## 4. Add a control

- **In the kit** (`packages/ui/src/components`): give it a `disabled` input and read the scope
  with `closedBy(() => this.disabled())` from `disabled-scope.directive.ts`; draw the disabled
  state as `CELL` or `ncInput` do; show it on `/ui-kit` in the Disabled context section; spec it.
- **Drawn by the app** (a raw `button`, an SVG with handles, a label over a file input): ask the
  scope with `protected readonly closed = closedBy(() => false)`, bind `[disabled]="closed()"`,
  and return early from its pointer, key and drop handlers. A `label` has no `disabled`: make
  it `inert` with its input.
- A dialog opened from an editor is outside the scope. It is reached only through a control
  that is closed, so it needs nothing more, as long as that stays true.

## 5. Add a canvas tool

1. Add it to the tool type in the tab's store (`art/art.store.ts`, `map/map.store.ts`). If it
   changes nothing, add it to `ART_LOOKING_TOOLS` or `MAP_LOOKING_TOOLS`; a tool that pans,
   picks, selects or measures belongs there.
2. The tab's tool list marks every other tool `disabled` while the mode does not write, and the
   `tool` computed hands the canvas a looking tool in its place. Keep both derived from the
   list in step 1.
3. In the canvas, every path that writes returns first when `!this.mode.canWrite()`: the
   pointer handlers, and the public methods a key or a button reaches (paste, clear, settle,
   transform).
4. A keyboard shortcut for the tool goes through the tab's `setTool`, which refuses a tool
   that writes.

## 6. Check that read-only still holds

1. `npm run typecheck`
2. `LC_ALL=C npm test`. The specs that pin the doors:
   - `packages/engine/src/game/gate.test.ts`: every mutator against the class, byte for byte
     with the gate closed, and no `doc.transact` outside the gate.
   - `apps/web/src/app/features/editor/write-doors.spec.ts`: no `doc.transact` in the app
     outside the session's load.
   - `apps/web/src/app/features/editor/state/editor-mode.service.spec.ts` and
     `work-session/work-session.service.spec.ts`: the mode, who gets which session, the report
     of a write that went round the gate.
   - `packages/ui/src/components/disabled-scope.directive.spec.ts`: the scope, the way through,
     and every kit control with a `disabled` reading the scope.
3. A dev server of your own (`npx ng serve web --port <free port>`), then
   `E2E_BASE_URL=http://localhost:<port> npx playwright test --project=chromium e2e/editor`.
   `e2e/editor/read-only.spec.ts` opens a game as a staff member who does not collaborate on it
   (`mockEditor(page, { staff: true })` in `e2e/editor-mocks.ts`), tries to change it in every
   tab, compares the document byte for byte and counts the writes sent. Never a bare
   `npx playwright test`: it rewrites the documentation captures.
4. Open the tab yourself as that staff member and as a collaborator, in both themes, and look:
   lint, typecheck and unit tests see neither a template nor a disabled state.
5. Stop the dev server.

## 7. What `diff` will need

`diff` exists as a mode that does not write. Building it has to keep these true:

- The second version is another document, read and never written. The game the session holds
  stays the only one a gate lets through, and no write reaches either while the mode is `diff`.
- It is a mode, not a screen: the same tabs, under the same shell and the same scope. No copy of
  an editor is made to show a difference.
- Choosing it goes through `EditorModeService.choose`, and an imposed mode still wins over it.
- What only looks stays let through by name (`ncLooksOnly`); a control that picks the versions
  or steps through the differences is one of those.
- Leaving it returns to the mode that stood before, with the document untouched: byte for byte
  what it was when the mode was entered, apart from what collaborators wrote meanwhile.
- A session loaded once may be compared too, and stays one that saves nothing.
