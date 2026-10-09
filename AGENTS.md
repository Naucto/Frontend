# AGENTS.md

Guidance for AI agents and contributors working in the Naucto Frontend monorepo. Config files are
the rule authority; this file documents intent, conventions and gotchas tooling cannot capture.

## Overview

Naucto is a browser fantasy console (320×180 screen, 16-colour indexed palette, 8×8 sprites, Lua
games, real-time collaborative editing via Yjs, netplay). This repo holds the web app, the engine and
the UI kit, implementing the "Naucto Redesign" design (HD44780 character-LCD typeface on an 8 px grid,
Pixelarticons, Bubblegum-16 palette, dark + light themes).

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

| Command                                   | Purpose                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm install`                             | Install all workspaces; generates `@naucto/api-client` from `openapi.json`.                   |
| `npm start`                               | Angular dev server on `http://localhost:3001`.                                                |
| `npm run build`                           | Production build of every workspace.                                                          |
| `npm run lint` / `npm run lint:fix`       | ESLint (flat config) over the whole repo.                                                     |
| `npm run format` / `npm run format:check` | Prettier.                                                                                     |
| `npm run typecheck`                       | `tsc --noEmit` per workspace.                                                                 |
| `npm test`                                | Vitest in every workspace (`ng test` for the app).                                            |
| `npm run e2e`                             | Playwright (starts the dev server unless `E2E_BASE_URL` is set).                              |
| `npm run docs:build`                      | Builds the docs submodule into `apps/web/public/docs` (run it before `start`/`build`/`e2e`).  |
| `./dev.sh`                                | Dev server in Docker against the Backend on the `naucto-dev` network (hot reload, port 3001). |
| `docker compose up --build`               | Production-style image on port 3001; `APP_*` env vars configure it at runtime.                |

## How to work in this repo

1. **Explore and reuse before writing.** Check `packages/ui` for an existing `nc-*` primitive and
   `apps/web/src/app/shared` for composites before adding UI. A screen-specific component may not
   introduce a new button/field/panel style — it composes the kit.
2. **Config files are the rule authority**: `eslint.config.js`, `.prettierrc`, each `tsconfig.json`,
   `package.json`. The linter and Prettier own formatting.
3. **Feedback loop before finishing**: `npm run lint && npm run typecheck && npm test` (also run by
   the pre-commit hook and CI).
4. **Ask before architectural decisions** (new state library, new dependency, cross-cutting change).
5. **Never hand-edit generated code** (`packages/api-client/src` comes from `openapi.json`; docs assets
   are built from the submodule).

## Architecture

- **State**: server state via `@tanstack/angular-query-experimental` over `@naucto/api-client`
  (fetch); UI/editor state via `@ngrx/signals` SignalStores; the game document is a Yjs `Y.Doc`
  exposed through small signal adapters (`apps/web/src/app/shared/yjs`).
- **Dependency rule** (enforced by ESLint): `features/*` → `core`, `shared`, `@naucto/ui`,
  `@naucto/engine`, `@naucto/api-client`; `core`/`shared` never import `features`;
  `packages/engine` imports no framework.
- **Auth**: access token in memory only + httpOnly refresh cookie (silent refresh at boot). Never put
  tokens in `localStorage`.
- **Engine**: the Lua API is namespaced (`gfx`, `input`, `sound`, `map`, `net`, `sys`).
  `packages/engine/src/api/luaApiTable.ts` is the single source of truth (docs manifest parity,
  editor completions). Old games are migrated on load against frozen tables of their own
  (`migrations/v0_to_v1/globals.ts`, `migrations/v1_to_v2/renames.ts`), never against the live
  API; what a migration cannot rewrite is a warning on its line in the CODE tab.
- **Game document shape**: every sheet and every map is an entry of its collection (`gfx.sheets`,
  `map.maps`) holding its own cells and size; nothing is read from document roots or meta sizes.
  The shape moved inside schema v2 without a bump, so `migrateGame` also rewrites in place a v2
  document that still holds the older shape — see `migrations/v1_to_v2/shape.ts`.
- **Theming**: every colour comes from a token in `packages/ui/src/tokens.css`; never write raw hex in
  components. Dark is the default; light is `[data-theme=light]` or `prefers-color-scheme`.
- **Editor layout**: the shell is rail + routed workspace + one `nc-panel-region` on the right. Each
  tab draws its own inspector as an `nc-panel-column` at `PANEL_WIDTH`; the console column is CODE's
  own, and the region either unfolds the reference beside it or lends it that track when the window
  is too narrow for both. A panel there is never unmounted — it may hold a running game or the
  floating VIEWER pip. `EditorRuntimeService` exposes the one runtime (host, net bridge,
  insert-at-cursor) to every tab.
- **Netplay**: every `nc-game-screen` owns a `NetUiBridgeService`; `net.host()` / `net.join()`
  open the dialogs in `shared/netplay`. Permissions come from the game's `net.permissions` map
  (`core/net/net-permissions.ts`, bits CLIENT_READ=1 / CLIENT_WRITE=2, allow-by-default).
- **Usage analytics** (`core/analytics`): nothing is collected while the backend's `analytics`
  feature flag is off. The banner in `shared/consent` asks once, and the answer lives six months in
  the `naucto_consent` cookie. With consent, page views (`analytics.service.ts`), beats
  (`heartbeat.service.ts`) and plays (`play-reporter.ts`, fed by the `ncPlayTracking` directive on
  the game page) carry the `naucto_vid` and `naucto_sid` cookies. Without it, a tab sends only pings
  that hold no identifier. Every report goes through `AnalyticsTransport` as plain-text JSON with no
  credentials and no bearer, so no report names an account. The account is attached only when
  `BrowserAccountService` links the visitor. Features claim what the tab is doing (browsing,
  building, playing, hosting) through `ActivityService`. Settings → Privacy shows, exports and
  erases the account's history even with the flag off.
- **Boot order**: `provideApiClient()` runs one initializer — load `/config.json`, configure the
  client, bootstrap auth — because Angular initializers otherwise run concurrently.
- **Mobile** is out of scope for now but must not be blocked: measure widths with `ResizeObserver`
  into stores, keep `InputSource` pluggable, no desktop-only assumptions baked into layout code.

## Conventions

- Component selectors `nc-kebab-case`, directives `ncCamelCase`. Standalone, `OnPush`, `input()` /
  `output()` / `model()`, `inject()`, signals everywhere, no `any`.
- Files: kebab-case (`game-card.component.ts`, `auth.store.ts`); one responsibility per file.
- Imports sorted by `simple-import-sort`. Inside `apps/web`, relative paths; across packages, the
  package name (`@naucto/ui`, `@naucto/engine`, `@naucto/api-client`).
- A lazy route target (`*.page.ts`, `*.routes.ts`, the two shells) is its file's `export default`,
  so a route reads `loadComponent: () => import('./x.page')`; everything else is a named export.
- No one-letter names (`id-length`) beyond indexes `i`/`j`/`k`, coordinates `x`/`y`, a comparator's
  `a`/`b`, an ignored `_` and the `Y` namespace of Yjs.
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

## Deliberate divergences from the design

Where the artboards draw something the product cannot honestly do yet, we leave it out and say why
here rather than shipping a control that does nothing. A button that toasts "not yet" reads as
broken; an absence reads as not built.

- **`FORMAT` in the CODE tab.** The artboard pairs it with `FIND` in the file strip. There is no Lua
  formatter behind it, and `luaparse` parses but does not print. Revisit when there is one.
- **`AUTOTILE` in the MAP tab.** The idea is real: lay a scene's edges and corners from what sits
  next to a tile. It needs a tileset convention first — which cell of a sheet is a top edge, which
  is an inner corner — and the engine has none, so there is nothing behind the button to call. It
  stood there permanently disabled, promising itself, which is the shape this list exists to stop.

- **`+ ADD ACTION` on the controls page.** `ACTIONS` in `packages/engine/src/input/ActionMap.ts` is
  nine fixed bits, and the input path is a bitmask — a game _names_ those actions in its GAME tab,
  it cannot invent new ones. There is nothing for the button to add. If custom
  actions ever land, this is the surface for them.
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

- **Drag-to-reposition in the touch pad panel.** SIZE and OPACITY are real and drive the pad; moving
  individual buttons is not built, and the panel's copy does not claim it.

- **The STEPS field moves by 16, not by 4.** The sheet's own tooltip says `4-64, step 4`, and the
  same box's buttons are captioned `+1`/`-1` — the sheet does not agree with itself. Four steps is
  not a phrase, so a pattern is never cut there, and by-4 puts fifteen stops between the two lengths
  anybody uses. BPM keeps the sheet's `40-240, step 1`, which is a tempo and is asked for one at a
  time.

## Gotchas

- `fengari` needs `patches/fengari+0.1.5.patch` (applied by `patch-package` on `postinstall`). Besides
  keeping Node-only modules out of the browser bundle, it clears a released stack slot by assigning
  `undefined` rather than with `delete`: SpiderMonkey never compiles `delete` on an array element,
  and the VM releases slots on every call return, which cost an eighth of a running game on Firefox.
- `packages/api-client/src` is generated from `packages/api-client/openapi.json` by the same
  `postinstall` and gitignored. After replacing `openapi.json`, run
  `npm run generate -w @naucto/api-client`.
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
- Icons the design draws differently from pixelarticons live in `CUSTOM` in `tools/build-icons.mjs`
  and override the generated glyph of the same name. `npm run design:check` compares the two sets by
  rasterising each path, which is how a hollow play was found under a name that reads as correct —
  and it now checks the colours against `tokens.css`, the type scale and the corner ladder in the
  same pass. It drives `d2c report` from a Design2Code checkout beside this one
  (`Naucto/Design2Code`, private; point elsewhere with `D2C=<path> npm run design:check`).
  Most of `CUSTOM` is generated from the foundations artboard, which captions each glyph it shows;
  the rest are marks the design draws but never captions, and those are settled by **slot** — the
  glyph goes in under the name whose one call site is the button the design draws it on, never by
  nearest-neighbour, which finds a match for glyphs the design does not draw at all.
- **"I know about that one" has two forms and they live in different places.** A caption the app
  contradicts _on purpose_ goes in `DISAGREEMENTS` in the target profile
  (`Design2Code/packages/targets/naucto-angular/src/profile.ts`), with the reason the design's own
  usage outranks its gallery sheet. Something the design draws that the app simply has not got round
  to goes in `tools/design-coverage.json` with a note, and the change that finally draws it deletes
  that line in the same diff. Both exist so the report says nothing when nothing moved, which is the
  only state in which anyone keeps running it.
- Anything the app draws that is not in `ICON_PATHS` — the oscillator waves and the controller are
  the current cases — has to be listed in `EXTRA_SOURCES` in
  `Design2Code/packages/targets/naucto-angular/src/glyphs.ts`, or the report lists it as missing
  forever. `packages/ui/src/components/presence-flag.component.ts` draws its own path too and is not
  listed; nothing reports it today, so it stays out until something does. The edge chips in
  `presence-layer.component.ts` beside it use `nc-icon`, so they are covered.
- `IconSize` is `12 | 24 | 48` on purpose: a 24-grid glyph only stays crisp under
  `shape-rendering: crispEdges` at exact halves and doubles. Where an artboard renders one at 16,
  take the nearest legal step rather than widening the union.
- TypeScript 6: `baseUrl` is deprecated; path aliases are relative to each `tsconfig.json`.
- An ingest answer that asks to rotate the visitor or the session applies only while the cookies
  still hold the identity the request carried. Go through `applyRotation`, or a late answer about an
  old identity throws away a newer one.
- A play's running time is reported cumulatively under consent and as deltas without it. Moving
  between the two goes through `PlayReporter.sync()`, which hands over only what was not yet sent.
  Resetting the clock instead counts an interval twice or loses it.
- Analytics e2e specs wait for the routed page to render before sending the queue: a fresh load
  finishes its first navigation after Playwright's `load` event.
