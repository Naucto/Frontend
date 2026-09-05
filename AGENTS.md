# AGENTS.md

Guidance for AI agents and contributors working in the Naucto Frontend monorepo. Config files are
the rule authority; this file documents intent, conventions and gotchas tooling cannot capture.

## Overview

Naucto is a browser fantasy console (320×180 screen, 16-colour indexed palette, 8×8 sprites, Lua
games, real-time collaborative editing via Yjs, netplay). This repo holds the web app, the engine and
the UI kit, implementing the "Naucto Redesign" design (HD44780 character-LCD typeface on an 8 px grid,
Pixelarticons, Bubblegum-16 palette, dark + light themes).

| Path              | Package          | Purpose                                                                                                                                                                                              |
| ----------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | `web`            | Angular 22 app (standalone, signals, zoneless). Dev server on `localhost:3001`.                                                                                                                      |
| `packages/engine` | `@naucto/engine` | Pure-TypeScript engine: fengari Lua VM, gfx (WebGL2), sound (AudioWorklet synth), input, map, net, game document + migrations. **No framework imports.**                                             |
| `packages/ui`     | `@naucto/ui`     | Design tokens (`tokens.css`) and the `nc-*` pixel-grid component library (Angular + CDK + Tailwind).                                                                                                 |
| `docs/`           | git submodule    | `Naucto/Engine-Documentation` — Markdown pages + `api/*.yaml` manifest, built by `tools/docs-build.mjs` into `apps/web/public/docs/index.json` and rendered at `/learn` and in the editor's DOC tab. |
| `tools/`          | —                | Build scripts (`docs-build.mjs`, `build-icons.mjs`).                                                                                                                                                 |
| `nginx/`          | —                | Production nginx config + the entrypoint that writes `/config.json` from `APP_*` env vars.                                                                                                           |
| `e2e/`            | —                | Playwright end-to-end tests.                                                                                                                                                                         |

## Commands (run from the repo root)

| Command                                   | Purpose                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm install`                             | Install all workspaces (needs `NPM_TOKEN` with `read:packages` for `@naucto/api-client`, see `.env.example`). |
| `npm start`                               | Angular dev server on `http://localhost:3001`.                                                                |
| `npm run build`                           | Production build of every workspace.                                                                          |
| `npm run lint` / `npm run lint:fix`       | ESLint (flat config) over the whole repo.                                                                     |
| `npm run format` / `npm run format:check` | Prettier.                                                                                                     |
| `npm run typecheck`                       | `tsc --noEmit` per workspace.                                                                                 |
| `npm test`                                | Vitest in every workspace (`ng test` for the app).                                                            |
| `npm run e2e`                             | Playwright (starts the dev server unless `E2E_BASE_URL` is set).                                              |
| `npm run docs:build`                      | Builds the docs submodule into `apps/web/public/docs` (run it before `start`/`build`/`e2e`).                  |
| `./dev.sh`                                | Dev server in Docker against the Backend on the `naucto-dev` network (hot reload, port 3001).                 |
| `docker compose up --build`               | Production-style image on port 3001; `APP_*` env vars configure it at runtime.                                |

## How to work in this repo

1. **Explore and reuse before writing.** Check `packages/ui` for an existing `nc-*` primitive and
   `apps/web/src/app/shared` for composites before adding UI. A screen-specific component may not
   introduce a new button/field/panel style — it composes the kit.
2. **Config files are the rule authority**: `eslint.config.js`, `.prettierrc`, each `tsconfig.json`,
   `package.json`. The linter and Prettier own formatting.
3. **Feedback loop before finishing**: `npm run lint && npm run typecheck && npm test` (also run by
   the pre-commit hook and CI).
4. **Ask before architectural decisions** (new state library, new dependency, cross-cutting change).
5. **Never hand-edit generated code** (`@naucto/api-client` is a published package; docs assets are
   built from the submodule).

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
  `packages/engine/src/api/luaApiTable.ts` is the single source of truth (prelude, migrations, docs
  manifest parity, editor completions). Old games are migrated transparently on load.
- **Theming**: every colour comes from a token in `packages/ui/src/tokens.css`; never write raw hex in
  components. Dark is the default; light is `[data-theme=light]` or `prefers-color-scheme`.
- **Editor layout**: the shell is rail + routed workspace + console column. Tabs listed in
  `PANEL_TABS` (`editor-ui.store.ts`) own the right column as a tool panel and the runtime floats
  as the VIEWER pip. `EditorRuntimeService` exposes the one runtime (host, net bridge, insert-at-
  cursor) to every tab.
- **Netplay**: every `nc-game-screen` owns a `NetUiBridgeService`; `net.host()` / `net.join()`
  open the dialogs in `shared/netplay`. Permissions come from the game's `net.permissions` map
  (`core/net/net-permissions.ts`, bits CLIENT_READ=1 / CLIENT_WRITE=2, allow-by-default).
- **Planned backend endpoints** (friends, presence, `/users/me`) are hand-typed in
  `core/api/planned.api.ts` until the Backend stack ships them in `@naucto/api-client`; pages
  degrade to an honest empty state on 404.
- **Boot order**: `provideApiClient()` runs one initializer — load `/config.json`, configure the
  client, bootstrap auth — because Angular initializers otherwise run concurrently.
- **Mobile** is out of scope for now but must not be blocked: measure widths with `ResizeObserver`
  into stores, keep `InputSource` pluggable, no desktop-only assumptions baked into layout code.

## Conventions

- Component selectors `nc-kebab-case`, directives `ncCamelCase`. Standalone, `OnPush`, `input()` /
  `output()` / `model()`, `inject()`, signals everywhere, no `any`.
- Files: kebab-case (`game-card.component.ts`, `auth.store.ts`); one responsibility per file.
- Imports sorted by `simple-import-sort`; use `@app/*`, `@naucto/*` aliases, no `../../` chains.
- All user-facing strings go through Transloco (`en` only for now).
- Commits: `[PART] [TYPE] Capitalized message`, TYPE ∈ ADD/REMOVE/UPDATE/REFACTO/CLEAN/FIX, PART e.g.
  FRONTEND/ENGINE/UI/DOCS/TOOLING. Branch = Jira key. Stacked PRs with `gh stack`.
- `TODO(NCTO-123): …` for tracked debt.

## Security

No secrets in the repo (`NPM_TOKEN` lives in `.env`, never in `.npmrc` values or Docker layers).
Sanitise any HTML that does not come from our own build (docs are built at compile time). Validate
redirect targets. Do not disable security lint rules. See `SECURITY.md`.

## Deliberate divergences from the design

Where the artboards draw something the product cannot honestly do yet, we leave it out and say why
here rather than shipping a control that does nothing. A button that toasts "not yet" reads as
broken; an absence reads as not built.

- **`FORMAT` in the CODE tab.** The artboard pairs it with `FIND` in the file strip. There is no Lua
  formatter behind it, and `luaparse` parses but does not print. Revisit when there is one.
- **`+ ADD ACTION` on the controls page.** `ACTIONS` in `packages/engine/src/input/ActionMap.ts` is
  nine fixed bits, and the input path is a bitmask — a game _names_ those actions with
  `input.declare{}`, it cannot invent new ones. There is nothing for the button to add. If custom
  actions ever land, this is the surface for them.
- **Drag-to-reposition in the touch pad panel.** SIZE and OPACITY are real and drive the pad; moving
  individual buttons is not built, and the panel's copy does not claim it.

## Gotchas

- `fengari` needs `patches/fengari+0.1.5.patch` (applied by `patch-package` on `postinstall`).
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
  listed; nothing reports it today, so it stays out until something does.
- `IconSize` is `12 | 24 | 48` on purpose: a 24-grid glyph only stays crisp under
  `shape-rendering: crispEdges` at exact halves and doubles. Where an artboard renders one at 16,
  take the nearest legal step rather than widening the union.
- TypeScript 6: `baseUrl` is deprecated; path aliases are relative to each `tsconfig.json`.
