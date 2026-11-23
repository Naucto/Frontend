# AGENTS.md

Guidance for AI agents and contributors working in the Naucto Frontend monorepo. Config files are
the rule authority; this file documents intent, conventions and gotchas tooling cannot capture.

## Overview

Naucto is a browser fantasy console (320×180 screen, 16-colour indexed palette, 8×8 sprites, Lua
games, real-time collaborative editing via Yjs, netplay). This repo holds the web app, the engine and
the UI kit, implementing the "Naucto Redesign" design (HD44780 character-LCD typeface on an 8 px grid,
icons drawn on the kit pixel, Bubblegum-16 palette, dark + light themes).

| Path              | Package          | Purpose                                                                                                                                                                                                                                                   |
| ----------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | `web`            | Angular 22 app (standalone, signals, zoneless). Dev server on `localhost:3001`.                                                                                                                                                                           |
| `packages/engine` | `@naucto/engine` | Pure-TypeScript engine: fengari Lua VM, gfx (WebGL2), sound (AudioWorklet synth), input, map, net, game document + migrations. **No framework imports.**                                                                                                  |
| `packages/ui`     | `@naucto/ui`     | Design tokens (`tokens.css`) and the `nc-*` pixel-grid component library (Angular + CDK + Tailwind).                                                                                                                                                      |
| `docs/`           | git submodule    | `Naucto/Engine-Documentation` — Markdown pages + `api/<namespace>/<function>.yaml` manifest (standard Lua under `api/lua/`), built by `tools/docs-build.mjs` into `apps/web/public/docs/index.json` and rendered at `/learn` and in the editor's DOC tab. |
| `tools/`          | —                | Build scripts (`docs-build.mjs`, `build-icons.mjs`).                                                                                                                                                                                                      |
| `nginx/`          | —                | Production nginx config + the entrypoint that writes `/config.json` from `APP_*` env vars.                                                                                                                                                                |
| `e2e/`            | —                | Playwright end-to-end tests.                                                                                                                                                                                                                              |

## Commands (run from the repo root)

| Command                                   | Purpose                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install`                             | Install all workspaces; generates `@naucto/api-client` from `openapi.json`.                                                                          |
| `npm start`                               | Angular dev server on `http://localhost:3001`.                                                                                                       |
| `npm run build`                           | Production build of every workspace.                                                                                                                 |
| `npm run lint` / `npm run lint:fix`       | ESLint (flat config) over the whole repo.                                                                                                            |
| `npm run format` / `npm run format:check` | Prettier.                                                                                                                                            |
| `npm run typecheck`                       | `tsc --noEmit` per workspace.                                                                                                                        |
| `npm test`                                | Vitest in every workspace (`ng test` for the app).                                                                                                   |
| `npm run e2e`                             | Playwright (starts the dev server unless `E2E_BASE_URL` is set).                                                                                     |
| `npm run pixel:check`                     | Fails on rounded corners, off-pixel strokes, density tokens, "·" separators, an icon that is neither 18 nor 24 and a glyph too large for its button. |
| `npm run icons:check`                     | Fails when `packages/ui/src/icons/glyphs.ts` is not what the cell drawings give (`node tools/build-icons.mjs` rebuilds it).                          |
| `npm run docs:build`                      | Builds the docs submodule into `apps/web/public/docs` (run it before `start`/`build`/`e2e`).                                                         |
| `./dev.sh`                                | Dev server in Docker against the Backend on the `naucto-dev` network (hot reload, port 3001).                                                        |
| `docker compose up --build`               | Production-style image on port 3001; `APP_*` env vars configure it at runtime.                                                                       |

## How to work in this repo

1. **Explore and reuse before writing.** Check `packages/ui` for an existing `nc-*` primitive,
   `apps/web/src/app/shared` for composites and `shared/queries` for the request before adding
   one. A screen-specific component may not introduce a new button/field/panel style — it
   composes the kit. What already does the job is extended; a second way to do it (another
   helper that unwraps an answer, a variant of a dialog) is not added beside the first.
2. **Config files are the rule authority**: `eslint.config.js`, `.prettierrc`, each `tsconfig.json`,
   `package.json`. The linter and Prettier own formatting.
3. **Feedback loop before finishing**: `npm run lint && npm run typecheck && npm test`. The
   pre-commit hook formats and lints the staged files and nothing more (no build, no generation);
   CI runs these three with the checks of the table above, then Playwright on Chromium.
4. **Ask before architectural decisions** (new state library, new dependency, cross-cutting change).
5. **Never hand-edit generated code** (`packages/api-client/src` comes from `openapi.json`; docs assets
   are built from the submodule).
6. **Settle a look in an artifact before writing it into the app.** When a change concerns a screen
   the design does not draw, or its look would take back-and-forth to settle:
   1. Say so to the user before building anything, and go on only if they agree.
   2. Build several versions that differ in structure, with the real kit, on fixtures.
   3. Publish them as an artifact: a screenshot per version and state, each with its trade-off.
   4. Let the user pick one or ask for another round.
   5. Implement only what was picked.

   The method in full, for agents that load project skills:
   `.claude/skills/naucto-screen-design/SKILL.md`.

7. **Add nothing the change does not need.** A helper with one caller, an interface with one
   implementation, an option nobody sets, an `export` nothing imports, a setting for what the
   build already knows: each is one more name to hold for no gain. Write the body where it is
   used. A name is earned by a second caller, by a test that imports it, or by a constraint the
   expression cannot state.

The order of work for a change to the web app, with what to look at and the checks to pass, is
in `.claude/skills/naucto-frontend-change/SKILL.md`.

## Architecture

- **State**: server state via `@tanstack/angular-query-experimental` over `@naucto/api-client`
  (fetch); UI/editor state via `@ngrx/signals` SignalStores; the game document is a Yjs `Y.Doc`
  exposed through small signal adapters (`apps/web/src/app/shared/yjs`).
- **Dependency rule** (enforced by ESLint): `features/*` → `core`, `shared`, `@naucto/ui`,
  `@naucto/engine`, `@naucto/api-client`; `core`/`shared` never import `features`;
  `packages/engine` imports no framework.
- **Who decides**: the server validates and decides, the page asks and shows. A limit the page
  shows is one the server gave (`injectProjectLimits`, the password policy of the sign-in form),
  a refusal is read from the answer, and what takes more than the page holds (a count, a
  ranking, who may) is asked for, not rebuilt from a list. A rule copied into the client is a
  second rule, wrong the day the first one moves.
- **Each layer once**: inside the app too, a thing is decided in one place. `unwrap`
  (`core/api/api-errors.ts`) turns an answer into its payload or an `ApiError`, a query helper
  holds a request and its key, a store holds UI state, and `GlobalErrorHandler` takes what nobody
  caught. `ToastService` decides how a message is shown and to whom (`debug` reaches a developer
  and a production build drops it), so a caller says what happened and never asks which build it
  runs in.
- **A request and its failure**: a call to the generated client is unwrapped with `unwrap`, and
  one that more than one screen makes is an `injectX` helper in `shared/queries`. A failure is
  narrowed on what the contract declares, a `code` (`PROJECT_HIDDEN`, `COLLECTIONS_LIMIT`, read
  as `error instanceof ApiError && error.code === …`) or a status that means one thing (404).
  Everything else (a timeout, a 502, no network) is a failure that can be tried again:
  `nc-error-state` with its `retry` for a read, as `game.page.ts` does, a toast for a write. An
  unknown failure read as the expected one tells someone their link expired when the server was
  down. A control that shows a server value holds it in a `linkedSignal` and is set back when
  the write fails (`publishing.component.ts`), so the screen never keeps what the server
  refused. A code the page needs and the contract lacks is added to the backend's response
  schema first.
- **Auth**: access token in memory only + httpOnly refresh cookie (silent refresh at boot). Never put
  tokens in `localStorage`.
- **Ids**: every id the backend answers (an account, a game, a comment, a report, a notification,
  a collection) is a lower-case UUID string. It is opaque: compared for equality, never ordered
  to mean older or newer, never computed on, never shown to a person. Where every client has to
  sort the same ids alike (the colours and the order of collaborators), `compareIds`
  (`core/ids/ids.ts`) orders them as the server does. A look drawn from an id (the plastic of a
  disk nobody dressed, a person's colour) comes from the kit's `hashOf`. A fixture writes one as
  `uuidOf(7)` (`@naucto/api-client/testing`), in unit specs and in `e2e/` alike.
  - **The player number is the one integer.** `playerId` in the answer of a game-session
    connection, and the `to`, `from` and `userId` of the game table's signaling, are a
    `PlayerNumber` (`packages/engine/src/net/SessionTransport.ts`): what a game reads as
    `net.id()`, receives in `peer.joined` and `peer.left` and gets as the `from` of an event.
    Published games compute on it, so it stays an integer all the way into Lua
    (`NetAPI.test.ts`). It names a player at the table and never an account. Whose account a
    number is comes from the roster of the session (`GET /game-sessions/{sessionId}/players`,
    `playerId` beside `userId`): a game page names and draws a player from the entry that
    holds their number, as the host dialog does its seats, and one the roster does not hold
    reads "player N" with no face. The NET tab runs sessions from the editor, whose test rig
    plays under a number no account has, so it names its players from what each
    collaborator's editor shares of itself in the work session (`AwarenessState.player`).
  - **Old links.** `/play/<number>` and `/edit/<number>/…` were written while games were
    numbered. `gameAddressGuard` (`core/ids/game-address.guard.ts`), a `canMatch` on both
    routes, asks `GET /projects/legacy/{number}` and sends the navigation on to the same
    address under the id, with its child path and its query. A number no game had, and
    anything that is neither an id nor a number, does not match and falls through to
    not-found. A page is never built on a number, and no other request carries one.
  - **"No game" is the nil UUID** in the analytics export, which Settings › Privacy hands over
    as the server wrote it.
- **Engine**: the Lua API is namespaced (`gfx`, `input`, `sound`, `map`, `net`, `sys`).
  `packages/engine/src/api/luaApiTable.ts` is the single source of truth (docs manifest parity,
  editor completions). Old games are migrated on load against frozen tables of their own
  (`migrations/v0_to_v1/globals.ts`, `migrations/v1_to_v2/renames.ts` and `actions.ts`,
  `migrations/v2_to_v3/legacy.ts`, `migrations/v3_to_v4/legacy.ts`), never against the live API or the live presets; what a
  migration cannot rewrite is a warning on its line in the CODE tab.
- **Game document shape**: every sheet, every map and every action is an entry of its collection
  (`gfx.sheets`, `map.maps`, `input.actions`); a sheet and a map hold their own cells and size,
  and nothing is read from document roots or meta sizes. That shape moved inside schema v2 without
  a bump, so the step from v2 to v3 first brings a v2 document that still holds the older one to
  it — see `migrations/v1_to_v2/shape.ts`.
- **Input**: a game defines its own actions (schema v3, at most 32, one bit each of a player's
  mask). An action has the name the code reads it by, a label and a description for players, and
  the inputs plugged into it: keyboard keys of the first or the second player, and gamepad
  controls from a closed standard set, the same on every pad (`input/actions.ts`). The engine
  builds its `ActionTable` from the game and follows the document, so an action edited while the
  game runs is live at the next step. The on-screen pad is a gamepad: it presses gamepad controls
  for player 1, its cross standing for the left stick too, and draws only the controls the game
  uses (`input/touch-pad.ts`). Nobody rebinds: what the author sets is what every player gets.
  What stays per device is which player a gamepad drives and the on-screen pad's size and opacity:
  one component, `shared/controls`, shown by Settings › Controls and by the dialog the gear of a
  game screen's transport opens. The seats live in `GamepadSeatsStore` for as long as the tab, and
  every runtime follows them through `GamepadSource.assign`.
  A new game starts on the `classic` preset (`input/presets.ts`), the nine actions every game had
  before v3, which is what keeps the starter code, the tutorials and the docs examples running.
- **Sound storage**: `sound.patterns`, `sound.songs` and `sound.effects` hold one JSON string per
  entry, written and read only through `packages/engine/src/sound/storage.ts`. Notes are
  `[step, pitch, length, instrument, volume?]` and blocks `[id, pattern, start, repeat?]`, a
  volume or a repeat of 1 left out, because the project budget counts these bytes. The reader
  still takes the object form older documents hold. Musics as blocks and sound effects of their own
  came with schema v4 (`migrations/v3_to_v4`).
- **Theming**: every colour comes from a token in `packages/ui/src/tokens.css`; never write raw hex in
  components. Dark is the default; light is `[data-theme=light]` or `prefers-color-scheme`.
- **Pixel kit**: one pixel is 3px (`--nc-px`) and every stroke is a whole number of them; boxes,
  paddings and gaps are free. A frame is a bevel utility from `tokens.css` — `raised-sm` /
  `raised-lg` for what is pressed, `well` for what is typed in, `flat-sm` / `flat-lg` for the rest —
  painted from five colour roles (`bevel-edge-*`, `bevel-hi-*`, `bevel-lo-*`, `bevel-skirt-*`,
  `bevel-fill-*`). A state changes roles (`hover:bevel-lit`, `active:bevel-down`), never the shape.
  Control heights come from the `--nc-h-*` ladder; there are no densities and no radius scale.
- **Editor layout**: the shell is rail + routed workspace + one `nc-panel-region` on the right. Each
  tab draws its own inspector as an `nc-panel-column` at `PANEL_WIDTH`; the console column is CODE's
  own, and the region either unfolds the reference beside it or lends it that track when the window
  is too narrow for both. A panel there is never unmounted — it may hold a running game or the
  floating VIEWER pip. `EditorRuntimeService` exposes the one runtime (host, net bridge,
  insert-at-cursor) to every tab.
- **Netplay**: every `nc-game-screen` owns a `NetUiBridgeService`; `net.host()` / `net.join()`
  open the dialogs in `shared/netplay`. A screen may be opened on a session (its `invite` input):
  the game page takes one from `/play/:id?session=<uuid>[&code=<join code>]`, which is what the
  hub's Join, a session of the search panel, a friend's slot and an invitation all link to, and the
  editor's test rig takes its host's. The game reads it with `net.invite()`, and its `net.join()`
  enters it with no dialog until the session is left, ends or refuses the player. The page drops
  the params once the session is joined or turned down, so a reload never goes back in.
  Permissions come from the game's `net.permissions` map (`core/net/net-permissions.ts`, bits
  CLIENT_READ=1 / CLIENT_WRITE=2, allow-by-default). An entry with `flags` is a path's own rule; one
  without declares the path, which takes the rule of its nearest ancestor that has one. The NET
  tab declares paths before anything runs and adds the session's values beside them once one does.
- **Usage analytics** (`core/analytics`): nothing is collected while the backend's `analytics`
  feature flag is off. The banner in `shared/consent` asks once, and the answer lives six months in
  the `naucto_consent` cookie. With consent, page views (`analytics.service.ts`), beats
  (`heartbeat.service.ts`) and plays (`play-reporter.ts`, fed by the `ncPlayTracking` directive on
  the game page) carry the `naucto_vid` and `naucto_sid` cookies. Without it, a tab sends only pings
  that hold no identifier. A ping says whether the tab refused or has not answered yet
  (`AnalyticsModeService.pingConsent`). Every report goes through `AnalyticsTransport` as plain-text JSON with no
  credentials and no bearer, so no report names an account. The account is attached only when
  `BrowserAccountService` links the visitor. Features claim what the tab is doing (browsing,
  building, playing, hosting) through `ActivityService`. Settings → Privacy shows, exports and
  erases the account's history even with the flag off.
- **Feedback** (`shared/feedback`): what people tell the team, sent as reports to the backend's
  `/reports` routes.
  - **Rating prompt.** A play of two minutes (`PlayTrackingDirective`) or five minutes in the
    editor arms `FeedbackStore`. `nc-feedback-prompt` then opens a modal in the middle of the
    screen, on the hub after a play or on any app-shell page after the editor. It waits for the
    consent banner and any other dialog. Escape and the backdrop do not close it: it is answered,
    put off ("not now", 14 days) or declined. It asks an account once, and Settings → Privacy turns
    it back on.
  - **Rating.** The person says whether they mostly play or make games (offered from what they were
    just doing), then gives a score from 1 to 10 (`nc-rating`) with two optional comments. A score
    of 4 or less also asks for reasons and offers a bug report.
  - **Bug report.** The bug button beside the bell, the account menu and the footer open it. It
    lists everything it attaches before it is sent. It goes as JSON, and its screenshot follows on
    its own route: the running game's frame as a PNG, a one-frame screen capture or a file, shrunk
    to 1920 px and WebP. Whether it fits is the server's call: a refused screenshot leaves the
    report sent, and the thanks says so.
  - **Thanks.** A sent report or rating opens `ThanksDialog`, which invites the person to the Naucto
    Discord (`DISCORD_INVITE`) and closes on OK or its cross.
  - **Who can send.** Ratings and bug reports need an account. `FeedbackLauncher` asks a signed-out
    reader to sign in over the page.
  - **Crash reports.** `CrashReporter` (`core/reports`) sends uncaught errors (`GlobalErrorHandler`)
    and engine faults (`Engine.onFault`, plus the WebGL and audio backends' `onFault`) to
    `/reports/crash`. It goes through `AnalyticsTransport`, so a report carries no account and no
    identifier whatever the consent answer, once per message and at most three per tab. A Lua error
    in a game is the game's own and is never reported, and neither is an app that fails to boot:
    that failure shows to everyone already. A crash is said on screen only through
    `ToastService.debug`, which a production build drops: a player has nothing to do about a crash
    already reported.
  - **Readable stacks.** The production build writes hidden source maps beside each bundle (no
    `sourceMappingURL`, so browsers never load them), and nginx serves them. The backend reads them
    to map a crash stack back to the sources.
- **Moderation** (`shared/moderation`): what the site shows of it. Staff decide in the admin
  console, never here. Nothing of it shows while the backend's `moderation` feature flag is off.
  - **Words.** "Report" already names bug reports and ratings (`shared/feedback`, `/reports`),
    so a user's report of a game, a comment, a collection or a profile is a **flag** in the code
    (`FlagContentDialog`, `ContentFlagLauncher`, `/moderation/flags`). The buttons still say
    Report, which is the word people know.
  - **Reporting.** Report sits on each comment, under a game's actions, on a collection's page
    and on a profile, never on your own content.
  - **What an account is shown.** A comment a moderator removed reads as such. A withheld game
    answers its play page as unavailable, and its owner finds it marked Hidden with Publish
    blocked; such a game takes no new disk and enters no collection, and the GAME tab's Disk
    view and the add-to-collection checklist say why. A withheld collection answers anyone
    else as not found. Its owner reads it with `hiddenAt` set: the page says so and closes what
    would change it (its details, a game added, the order), a game can still be taken out and
    the box deleted, and the box is marked Hidden on My games. `nc-suspension-band` sits in
    both shells. Settings → Standing lists every decision
    with what staff said, and a `MODERATION` notification leads there.
  - **Suspended.** `AuthStore.suspension` comes from the profile. A control that writes goes
    through `GoodStandingAction`, which wraps `SignedInAction` and explains on the press
    (lint-enforced: nothing else imports `SignedInAction`). The
    server refuses the write whatever the page does, and the API client reads the profile again
    on `ACCOUNT_SUSPENDED` so an open tab learns of it.
  - **A game looked at.** `edit/:id` is the one address of the editor, and
    `WorkSessionService.open` decides alone what the account gets on it. A collaborator gets the
    live session. A staff member who does not collaborate, and a suspended account on its own
    game, get the last save loaded once (`session.preview()` says whose): GET requests alone,
    then a local copy that joins no work session, elects no host, connects no peer and saves
    nothing. That load imposes the `read-only` mode, so the same editor is read, and the game
    run from its Game preview, with nothing written: see "Editor modes". The band over it
    (`nc-read-only-band`) says why, and tells a staff member what the game is, hidden by
    moderation, not published or published, and who made it. Anyone else is told the game
    cannot be opened. `staff/edit/:id` and `staff/play/:id` are redirects to it.
- **Release.** `APP_RELEASE` (`core/config/release.ts`) is the version of `apps/web` and the commit
  it was built from, compiled in by `tools/build-web.ts`. The Docker image has no `.git`, so its
  build takes the commit as `--build-arg GIT_COMMIT`. A development server says `dev`.
- **Boot order**: `provideApiClient()` runs one initializer — load `/config.json`, configure the
  client, bootstrap auth, read the feature flags — because Angular initializers otherwise run
  concurrently.
- **Feature flags** (`core/config/features.service.ts`): `monetization`, `analytics` and
  `moderation`, read once at boot and all off when the server cannot answer. A flag is what lets
  a deployment switch something off; ask before putting a feature behind a new one.
- **Mobile** is out of scope for now but must not be blocked: measure widths with `ResizeObserver`
  into stores, keep `InputSource` pluggable, no desktop-only assumptions baked into layout code.

## Editor modes

Every editor can be read without being written, so there is no second screen that shows a game to
someone who may not change it.

- **The model.** `EditorMode` is `normal`, `diff` or `read-only`, held by `EditorModeService`
  (`features/editor/state`), provided by the editor shell with the session. A mode comes from two
  places: the code **imposes** one (`impose`, for a game loaded to be looked at) and the person
  **chooses** one (`choose`). The imposed one wins and nothing takes it back. An editor asks one
  question, `mode.canWrite()`: `normal` writes, the two others do not. How a session was opened is
  the session's business (`session.preview()`: live, or loaded once with no network and no save)
  and is never asked in place of `canWrite`. `diff` closes writing and is nothing more yet: no
  second document, no control that chooses a mode.
- **Three doors, one per kind of write.**
  1. **The document.** `EditableGame.transact` is the gate: the only place that opens a
     transaction for an edit. Whoever builds the game tells it whether it may write
     (`new EditableGame(doc, mayWrite)`; the session answers yes while it opens, then
     `mode.canWrite()`). Refused, it runs nothing and returns `false`; it never throws. Every
     mutator goes through it, as do the pixels, flags and tiles a `Sheet` or a `GameMap` writes,
     the net rules (`declareNetPath`, `setNetPermission` and their siblings) and `yTextField`. A load
     (`Y.applyUpdate`, the session's `remote-init` writes), a migration and a peer's update are
     not edits and do not pass it. CodeMirror takes its writability from the mode through a
     compartment (`code-editor.component.ts`). A local update seen while the mode does not write
     is reported through `CrashReporter` by the session.
  2. **The controls.** `[ncDisabledScope]` on a container closes every kit control under it; the
     shell puts one round the routed tab, so a tab closes nothing by hand. It denies by default.
     `ncLooksOnly` is the one way through, for what changes the view and nothing else: on a
     control it lets that control through (what is projected into it stays closed), on any other
     element it lets through every control under it. A control the app draws without the kit
     asks the scope itself with `closedBy(() => false)`. A canvas is not a control: its tool
     group closes the tools that write (`ToolItem.disabled`), the tab hands it a tool that looks
     (`ART_LOOKING_TOOLS`, `MAP_LOOKING_TOOLS`), and its handlers return before writing.
  3. **The API.** No wrapper and no interceptor. The server refuses what the account may not
     do, and a closed control keeps the call from being made.
- **What a change owes.**
  - _A new tab_ is routed under the shell and is closed with the others. It lets through, by
    name, what only looks: the strips that navigate, the zoom, the transport.
  - _A new mutator_ of `EditableGame` writes inside `this.transact` and is given a line in
    `MUTATORS` of `packages/engine/src/game/gate.test.ts`, which compares the list against the
    class and proves each call changes nothing while the gate is closed.
  - _A new control_ in the kit that can be disabled reads the scope with `closedBy`
    (`disabled-scope.directive.spec.ts` fails on one that does not) and is shown on `/ui-kit`.
  - _A new write_ goes through one of the doors: `game.transact` for the document, never
    `doc.transact` or a bare write on a Yjs type (`write-doors.spec.ts` and `gate.test.ts` fail
    on the first), a kit control for a request to the API.
  - _A tab strip_ that navigates and edits is `ncLooksOnly` with `editable`, `removable` and
    `reorderable` bound to `mode.canWrite()`.
- **Checking it.** `e2e/editor/read-only.spec.ts` opens a game as a staff member who does not
  collaborate on it and compares the document byte for byte after trying to change it in every
  tab. The method for working on an editor is in `.claude/skills/naucto-editor-modes/SKILL.md`.

## Conventions

- Component selectors `nc-kebab-case`, directives `ncCamelCase`. Standalone, `OnPush`, `input()` /
  `output()` / `model()`, `inject()`, signals everywhere, no `any`.
- Files: kebab-case (`game-disk.component.ts`, `auth.store.ts`); one responsibility per file.
- Imports sorted by `simple-import-sort`. Inside `apps/web`, relative paths; across packages, the
  package name (`@naucto/ui`, `@naucto/engine`, `@naucto/api-client`).
- A lazy route target (`*.page.ts`, `*.routes.ts`, the two shells) is its file's `export default`,
  so a route reads `loadComponent: () => import('./x.page')`; everything else is a named export.
- No one-letter names (`id-length`) beyond indexes `i`/`j`/`k`, coordinates `x`/`y`, a comparator's
  `a`/`b`, an ignored `_` and the `Y` namespace of Yjs.
- A name says what the thing is to someone who has not read the code behind it: a word, not a
  letter or an abbreviation that needs its comment (`consented`, never `C`), shaped like its
  siblings.
- Comments are in English and say why: a constraint, an invariant, what a caller must know. One
  that repeats the next line or tells how the code came to be is removed.
- Export what another file imports, nothing more.
- What a template can say, the template says (`@if`, `@for`, a binding), rather than TypeScript
  building it.
- The document is reached through Angular: `inject(DOCUMENT)` from `@angular/common` (as
  `CrashReporter` and the bug report dialog do), a template reference or `ElementRef`, and an
  off-screen picture is an `OffscreenCanvas` (`frame-to-png.ts`). The global `document` goes
  round the injector, so nothing can stand in for it. Older files still name it; new code adds
  no use.
- Read a signal where it is used rather than copying it into a local first. A local stays when
  TypeScript must narrow it (two calls to `state()` are two values to the compiler) or when the
  value has to be the one read before a write or an `await`.
- Node-side code (Playwright, e2e, `tools/`) reads environment variables with `getEnv` /
  `getOptionalEnv` from `tools/env.ts`; a new variable is declared there with its type first. The
  browser app has no environment: its settings come from the runtime `config.json`.
- A component's template goes in its own `.html` once it runs past 5 lines (lint-enforced; test
  hosts excepted).
- Prettier owns formatting; ESLint adds `curly: all` and, in templates, one child element per line.
  Use the `private` keyword, never `#private` fields.
- All user-facing strings go through Transloco (`en` only for now).
- Commits: `[PART] [TYPE] Capitalized message`, TYPE ∈ ADD/REMOVE/UPDATE/REFACTO/CLEAN/FIX, PART e.g.
  FRONTEND/ENGINE/UI/DOCS/TOOLING. Branch = Jira key. Stacked PRs with `gh stack`.
- `TODO(NCTO-123): …` for tracked debt.

## Security

No secrets in the repo (see `.env.example` for what `.env` actually holds; never put one in
`.npmrc` values or Docker layers). Sanitise any HTML that does not come from our own build (docs
are built at compile time). Validate redirect targets. Do not disable security lint rules. See
`SECURITY.md`.

- **A token in a link.** A page reached by a link that carries a token (a confirmation, a
  reset) changes no account while someone is signed in: it sits behind `guestGuard`, or says who
  is signed in and stops. Opened by someone signed in, an attacker's own link would otherwise
  put that person in the attacker's account. What an address carries leaves it once read, as
  the game page drops `session` and `code`, and what is reported about a page is its path
  without the query (`pagePath`).
- **A request sent twice.** A button disabled while its request is away is a courtesy. Twenty
  requests sent together all pass a check made before the write, so what must happen once is
  refused by the server, on the write itself.
- **A finding** is written with the steps that reproduce it and the smallest change that closes
  it.

## Design rules

The owner's rules for every screen and every kit component. Where a design source draws otherwise,
the rule wins.

1. **No "·" between two things.** A dot says two things are apart and nothing about how they
   relate, so every line built on it reads flat. Say the relation with the kit: a count or a state
   is an `nc-chip` or an `nc-stat`, a name and its value are a label and a value, two facts are two
   elements a gap apart. Another character in its place ("|", "/", "—", "•") is the same dot.
   `npm run pixel:check` fails on one in the catalogue, a template or a string literal; comments
   and the docs submodule are not read.
2. **Hierarchy, not separators.** A rule under every row gives every row the same weight, and a
   screen ruled all over shows no structure at all. Group what belongs together, and tell groups
   apart by weight and spacing; keep a rule for the edge between two regions. A list of options or
   controls is the kit's table (`table[ncTable]`), not rows a screen rules by hand.
3. **A symbol is pixel art, and its pixel is the kit's.** Arrows, the cross, the plus, the check
   and key glyphs are drawn on a grid whose cell is one kit pixel (3px): an `nc-mark` (five cells,
   15px), an `nc-icon` (six cells at 18 beside words, eight at 24 standing alone), or an inline
   SVG under `shape-rendering: crispEdges`. Never a font character (×, ←, ↑, +): a glyph is sized
   by its face, not by the grid, and one the face lacks comes from whatever font the browser falls
   back to. Never a glyph scaled: its steps land on fractions of a pixel and its diagonals blur.
   Each size has its own drawing, and a control that needs a smaller mark gets one drawn for that
   size, not a shrunk icon.
4. **Alternatives read as alternatives.** Two keys bound to one action are written "Space or ↑",
   the arrow drawn. Two keycaps side by side read as a chord to press together.
5. **No words nobody asked for.** A notice that explains the screen and a caption that describes
   what is already on it ("your games, in the order you made them") are read once and keep their
   room for good. Keep the datum that informs, the count, and show it as rule 6 says. Name a
   control so it needs no explaining, or put the explanation behind an `nc-help-dot`, where it is
   asked for.
6. **What the kit draws is drawn with the kit.** A count is an `nc-chip` or an `nc-stat`, a person
   is the kit's avatar, a title that may overflow its plate is fitted as the floppy's label is. A
   look-alike, a coloured square with an initial or a bare number in a span, lacks what the piece
   carries (its frame, its reflection, the person's own colour) and stops following the kit at its
   next change. Look on `/ui-kit` before building any small element; if no piece fits, the kit
   gains one, and a page does not draw a one-off. A piece is used for what it is for: a frame
   holds controls and data, so prose (a policy, an explanation) is headings and paragraphs, as
   the privacy page is, and never a stack of panels.
7. **A count against its ceiling reads "3 of 10".** Characters typed against a limit, players
   against seats, a size against its budget: the catalogue's `count` key (`{{n}} of {{max}}`),
   never "3/10" or "3 / 10", which is rule 1's slash. `npm run pixel:check` (`count`) fails on two
   values a slash apart in a template or the catalogue.

## Deliberate divergences from the design

Where the artboards draw something the product cannot honestly do yet, we leave it out and say why
here rather than shipping a control that does nothing. A button that toasts "not yet" reads as
broken; an absence reads as not built.

- **The icons.** The design sets Pixelarticons and glyphs of its own on a 24 grid whose pixel is
  2px, at 12, 16, 24 and 48. The app draws every icon on the kit pixel instead, once for six
  cells (18px, beside words) and once for eight (24px, standing alone), because a stroke of 2px
  or 1px beside 3px frames reads as a second system, and none of them is the design's drawing: at
  six and eight cells a glyph is a mass with a cell left out, not an outline. A state that is on or done has a
  filled drawing (`heart-filled`, `notification-filled`, `lock-filled`), which the design does not
  draw. `npm run design:check` therefore finds none of the design's glyphs in the app: that is
  this divergence and not drift.

- **`FORMAT` in the CODE tab.** The artboard pairs it with `FIND` in the file strip. There is no Lua
  formatter behind it, and `luaparse` parses but does not print. Revisit when there is one.
- **`AUTOTILE` in the MAP tab.** The idea is real: lay a scene's edges and corners from what sits
  next to a tile. It needs a tileset convention first — which cell of a sheet is a top edge, which
  is an inner corner — and the engine has none, so there is nothing behind the button to call. It
  stood there permanently disabled, promising itself, which is the shape this list exists to stop.

- **File extensions on the CODE tabs.** The artboard writes `main.lua` and `player.lua`; a tab is
  called `main`, or `my helpers`. A tab is named for what it holds, and every one of them is Lua, so
  the suffix repeats the one thing they all share. The name is stored as it is written — it is the
  chunk name a Lua error blames and the name anything asking for the file by name uses — so a name
  may hold spaces, is capped at 24 characters, and may not hold a colon, which is what separates a
  chunk from its line in a Lua message.
- **The SPRITE SIZE stepper in the ART tab.** The artboard draws a 1×1…8×8 stepper and a canvas
  showing one block of that size. The canvas shows the whole 128×128 sheet instead, and the block is
  a rectangle dragged on the sheet map — a size selector and a position picker were two controls for
  one thing, and neither could say where on the sheet you were. What the stepper set is now read off
  the region (`region.w`×`region.h` beside the sprite number), and the LOCK toggle is what keeps a
  stroke inside it. The design's own sheet map, drawn as a wide band with 0/1/2/3 tabs, is square
  for the same reason: it has to show where the canvas is looking, which a quarter of it cannot.

- **Moderation controls on the site.** Staff hide, warn, suspend and delete in the admin console
  only. The site reports, previews and tells an account where it stands. One place to decide
  means one place to log and one session to trust.
- **Export of a game that is only looked at.** Looking at someone's draft is what a review needs.
  Leaving with it as a file is more than looking, so Export is closed with the rest of the GAME
  tab and is not let through as something that only looks.
- **The released build for staff.** The staff play page ran either the latest save or the build
  players got. A staff member now opens the editor, which holds the latest save: the released
  build is played where players play it.
- **An appeal button.** The standing says what was decided and why. There is no process behind a
  button to contest it yet, so there is no button.
- **A public mark on a suspended profile.** A suspension is between the account and the
  moderators. Nothing on a profile says it.

- **`Clear all` in the notifications panel.** The design pairs it with `Mark all read`. The API
  marks a notification read and never deletes one, so there is nothing for the button to clear.
- **`Interface sounds` in the account panel.** The interface makes no sound for a switch to
  silence.

- **Drag-to-reposition in the touch pad panel.** SIZE and OPACITY are real and drive the pad; moving
  individual buttons is not built, and the panel's copy does not claim it.

- **No STEPS field in the SOUND tab.** The sheet draws one; the length of a pattern or an SFX is set
  the way FL Studio sets it instead: drag END in the roll's ruler, a beat at a time, or write a note
  past the end, which lengthens it to the next beat. BPM keeps the sheet's `40-240, step 1`.

## Gotchas

- `disabled` is an input of `ncButton` and of `ncInput`, which write the attribute themselves from
  it and from the scope above. Bind it as `[disabled]`, never as `[attr.disabled]` (lint-enforced
  in templates): two writers of one attribute leave whichever wrote last.
- `EditableGame.addFile` and `addAction` answer `null`, and `updateAction` and `transact`
  `false`, where the game may not be written. A caller that goes on to use what it added checks.
- A bevelled element takes its ground from `bevel-fill-*`, never from `bg-*`: the background colour
  lies under the painted strips and shows through the stepped corners. Its border is transparent by
  construction, so `border-*` colours do nothing on it either.
- `glare` is asked for by name and only on a coloured call to action. It needs the element to be a
  bevel (it is cut to the bevel's outline) and it owns the element's `::after`.
- A shape (`flat-sm`, `flat-lg`, `raised-sm`, `raised-lg`, `well`) paints as a bare class only: the
  strips are one rule over those five names, so the stylesheet holds them once. Through `@apply` or
  a variant a shape brings its geometry alone; a stylesheet rule applies `bevel` beside it, once for
  all its frames, as the docs block of `apps/web/src/styles.css` does.
- `@naucto/ui` is declared free of side effects (`sideEffects` in its `package.json`). That is what
  lets a page that imports one component from the barrel load that one and not the whole kit, so a
  kit module does nothing at import that something other than its own exports relies on. Its barrel
  passes every name on with `export * from`: a name passed on with `export { X } from` makes the
  barrel itself part of whatever imports `X`, and the bundler puts the whole kit in what every page
  loads.
- A dialog a root service opens (`FeedbackLauncher`, `SignedInAction`, `nc-feedback-prompt`) is
  fetched with `import()` when it opens, and names the component by `import type` only: a static
  import puts the dialog and everything it draws in what every page loads
  (`lazy-dialogs.spec.ts` fails on one).
- A class in a component's own stylesheet that is spelled like a utility gets the utility as well:
  Tailwind reads the template and generates it. `label` set a disk's whole label in tracked
  capitals, `hidden` removed what was only meant to fade, and `outline` and `ring` draw strokes.
- `tools/pixel-allow.json` is what each file still owes `npm run pixel:check`. A change that moves a
  file onto the kit lowers its entry in the same diff (`npm run pixel:check -- --update`); nothing
  raises one.
- `fengari` needs `patches/fengari+0.1.5.patch` (applied by `patch-package` on `postinstall`). Besides
  keeping Node-only modules out of the browser bundle, it clears a released stack slot by assigning
  `undefined` rather than with `delete`: SpiderMonkey never compiles `delete` on an array element,
  and the VM releases slots on every call return, which cost an eighth of a running game on Firefox.
- `packages/api-client/src` is generated from `packages/api-client/openapi.json` by the same
  `postinstall` and gitignored. `openapi.json` is the backend's `swagger.json`
  (`npm run generate:swagger` there, on the branch the change goes with), copied whole, passed
  through Prettier and never edited by hand. After replacing it, run
  `npm run generate -w @naucto/api-client` and start the dev server again: one that was running
  may still serve the client it started with, and `./dev.sh` builds its image again, whose
  install is what generates the client there.
- End-to-end specs are run as `npx playwright test --project=chromium <specs>`. A bare
  `npx playwright test` also runs the `docs-shots` project, which is not a test run: it writes
  the documentation's captures into the `docs` submodule.
- npm 12 gates install scripts: approved packages are listed under `allowScripts` in `package.json`.
- `@ngrx/signals` is pinned to Angular via an `overrides` entry until ngrx ships an Angular 22 range.
- The `docs/` submodule must be checked out (`git submodule update --init`) before `docs:build`;
  the engine test `luaApiTable.docs.test.ts` fails when a function is missing from `docs/api`.
- `viewChild.required` inside `*transloco` throws NG0951 — use `viewChild` and guard, or query from
  the host (`ElementRef`).
- Tailwind class bindings with brackets (`[class.grid-cols-[…]]`) do not bind; compute the class
  string in a signal instead.
- The `label` utility sets its own `color`, so a parent's state colour (`aria-checked:text-gold-ink`
  and friends) never reaches a `.label` _child_ — the selected oscillator card kept a dim word under
  a gold border for exactly this reason. On the stateful element itself it is fine; on a child,
  write the type utilities out (`font-mono text-micro tracking-wide uppercase`) and let colour
  inherit.
- The icons are drawn as cells, in `packages/ui/src/icons/`: `icons-18.txt` and `icons-24.txt`
  hold every icon under the same names, `marks.txt` the marks. `node tools/build-icons.mjs` packs
  them into `glyphs.ts`, and `nc-icon` and `nc-mark` turn a packed drawing into its path
  (`glyph-path.ts`), so a glyph is added or changed in a `.txt` and nowhere else. A drawing is cut
  to its ink and centred in its box; one whose axis is a single cell is drawn on an odd count of
  cells and sits a pixel off the middle rather than doubling its stroke. `npm run icons:check` and
  `glyphs.spec.ts` fail on a table that is not what the drawings give, on a drawing larger than its
  box and on a name drawn at one size only.
- `npm run design:check` drives `d2c report` from a Design2Code checkout beside this one
  (`Naucto/Design2Code`, private; point elsewhere with `D2C=<path> npm run design:check`) and
  checks the colours against `tokens.css`, the type scale and the corner ladder. Its glyph pass
  reads path strings from `packages/ui/src/icons/paths.ts` and a `viewBox` from
  `icon.component.ts`, neither of which exists here: the table is `glyphs.ts` and holds packed
  cells. Until the target profile (`Design2Code/packages/targets/naucto-angular/src/glyphs.ts`)
  reads that, the pass cannot run; once it does, every glyph differs from the design's on
  purpose (see "Deliberate divergences").
- **"I know about that one" has two forms and they live in different places.** A caption the app
  contradicts _on purpose_ goes in `DISAGREEMENTS` in the target profile
  (`Design2Code/packages/targets/naucto-angular/src/profile.ts`), with the reason the design's own
  usage outranks its gallery sheet. Something the design draws that the app simply has not got round
  to goes in `tools/design-coverage.json` with a note, and the change that finally draws it deletes
  that line in the same diff. Both exist so the report says nothing when nothing moved, which is the
  only state in which anyone keeps running it.
- Anything the app draws that is not in the icon set — the oscillator waves and the controller are
  the current cases — has to be listed in `EXTRA_SOURCES` in
  `Design2Code/packages/targets/naucto-angular/src/glyphs.ts`, or the report lists it as missing
  forever. The controller moved to `apps/web/src/app/shared/controls/pad-art.component.ts`, and
  `npm run design:check` stops on the missing file until the entry that still names
  `features/settings/gamepad-art.component.ts` follows it there.
  `packages/ui/src/components/presence-flag.component.ts` draws its own path too and is not
  listed; nothing reports it today, so it stays out until something does. The edge chips in
  `presence-layer.component.ts` beside it use `nc-mark`.
- An `nc-icon` is 18 or 24 and nothing else, and the size picks the drawing: 18 beside words (a
  button's leading icon, a stat, a menu row, a chip), 24 standing alone (the top bar, the rail, an
  empty state, a tool, an icon-only button of 40 or taller). `pixel:check` fails on any other size
  and on an icon resized through its `svg`. One icon is drawn `doubled`, two kit pixels a cell:
  the Play mark over an idle game screen at least 640px wide, the one place `pixel:check` lets it
  be (`DOUBLED_ICON_HOME`). A state that is on or done takes the glyph's filled drawing, named
  `<name>-filled`, and the call site chooses between the two.
- A glyph keeps one kit pixel clear of the frame it stands in, on every side. A raised frame takes
  3px above and 6px below, so a control holds a glyph up to its height less 15: none at 28
  (`xs`), an `nc-mark` at 30 (`sm`, a toggle), an icon of 18 at 36 (`md`, a transport key), an
  icon of 24 from 40 (`lg` and up, a tool). A control too low for the glyph it needs takes the
  mark of that name, drawn in `marks.txt` if it is not there yet, or grows a step; the glyph is
  never the one to give. `pixel:check` (`icon-fit`) reads the size written on an `ncButton` or an
  `nc-toggle-button` and fails on a glyph too large for it; a kit component that frames its own
  glyph chooses the tier itself. The disk's diamond shows the 24 drawing from 175px across and
  the 18 one under it, and its band is never lower than a mark and its clearance.
- TypeScript 6: `baseUrl` is deprecated; path aliases are relative to each `tsconfig.json`.
- An ingest answer that asks to rotate the visitor or the session applies only while the cookies
  still hold the identity the request carried. Go through `applyRotation`, or a late answer about an
  old identity throws away a newer one.
- A play's running time is reported cumulatively under consent and as deltas without it. Moving
  between the two goes through `PlayReporter.sync()`, which hands over only what was not yet sent.
  Resetting the clock instead counts an interval twice or loses it.
- Analytics e2e specs wait for the routed page to render before sending the queue: a fresh load
  finishes its first navigation after Playwright's `load` event.
