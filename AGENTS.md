# AGENTS.md

Guidance for AI agents and contributors working in the Naucto Frontend monorepo. Config files are
the rule authority; this file documents intent, conventions and gotchas tooling cannot capture.

## Overview

Naucto is a browser fantasy console (320×180 screen, 16-colour indexed palette, 8×8 sprites, Lua
games, real-time collaborative editing via Yjs, netplay). This repo holds the web app, the engine and
the UI kit, implementing the "Naucto Redesign" design (HD44780 character-LCD typeface on an 8 px grid,
Pixelarticons, Bubblegum-16 palette, dark + light themes).

| Path              | Package          | Purpose                                                                                                                                                  |
| ----------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | `web`            | Angular 22 app (standalone, signals, zoneless). Dev server on `localhost:3001`.                                                                          |
| `packages/engine` | `@naucto/engine` | Pure-TypeScript engine: fengari Lua VM, gfx (WebGL2), sound (AudioWorklet synth), input, map, net, game document + migrations. **No framework imports.** |
| `packages/ui`     | `@naucto/ui`     | Design tokens (`tokens.css`) and the `nc-*` pixel-grid component library (Angular + CDK + Tailwind).                                                     |
| `docs/`           | git submodule    | `Naucto/Engine-Documentation` — Markdown + API manifest rendered in-app at `/learn`.                                                                     |
| `tools/`          | —                | Build scripts (`docs-build.mjs`, icon sprite).                                                                                                           |
| `e2e/`            | —                | Playwright end-to-end tests.                                                                                                                             |

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
| `npm run docs:build`                      | Builds the docs submodule into `apps/web/src/assets/docs`.                                                    |

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

## Gotchas

- `fengari` needs `patches/fengari+0.1.5.patch` (applied by `patch-package` on `postinstall`).
- npm 12 gates install scripts: approved packages are listed under `allowScripts` in `package.json`.
- `@ngrx/signals` is pinned to Angular via an `overrides` entry until ngrx ships an Angular 22 range.
- The `docs/` submodule must be checked out (`git submodule update --init`) before `docs:build`.
- The `label` utility sets its own `color`, so a parent's state colour (`aria-checked:text-gold-ink`
  and friends) never reaches a `.label` _child_ — the selected oscillator card kept a dim word under
  a gold border for exactly this reason. On the stateful element itself it is fine; on a child,
  write the type utilities out (`font-mono text-micro tracking-wide uppercase`) and let colour
  inherit.
- Icons the design draws differently from pixelarticons live in `CUSTOM` in `tools/build-icons.mjs`
  and override the generated glyph of the same name. `tools/design-icons.mjs` compares the two sets
  by rasterising each path, which is how a hollow play was found under a name that reads as correct.
  Most of `CUSTOM` is generated from the foundations artboard, which captions each glyph it shows;
  the rest are marks the design draws but never captions, and those are settled by **slot** — the
  glyph goes in under the name whose one call site is the button the design draws it on, never by
  nearest-neighbour, which finds a match for glyphs the design does not draw at all. Where the app
  deliberately disagrees with a caption, say so in `EXCEPTIONS` in `tools/design-icons.mjs` so the
  report's "names that disagree" stays at zero and keeps working as a regression signal.
- Anything the app draws that is not in `ICON_PATHS` — the oscillator waves are the current case —
  has to be taught to `design-icons.mjs` as well, or the report lists it as missing forever.
- `IconSize` is `12 | 24 | 48` on purpose: a 24-grid glyph only stays crisp under
  `shape-rendering: crispEdges` at exact halves and doubles. Where an artboard renders one at 16,
  take the nearest legal step rather than widening the union.
- TypeScript 6: `baseUrl` is deprecated; path aliases are relative to each `tsconfig.json`.
