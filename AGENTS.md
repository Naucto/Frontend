# AGENTS.md

Guidance for AI agents and contributors working in the Naucto Frontend. This is a **working
guide, not a rigid rulebook** — the config files are the source of truth for enforced rules;
this file documents the intent, conventions, and gotchas that tooling can't capture.

> Compatible with Claude Code (via `CLAUDE.md` → `@AGENTS.md`) and OpenCode (native `AGENTS.md`).

## Overview

Naucto Frontend is a React 19 + Vite 8 + TypeScript single-page app: a collaborative,
multiplayer game editor. It uses MUI v7 for UI, Yjs (CRDT) + y-webrtc for real-time
collaboration, Monaco for code editing, and the fengari Lua VM to run games in the browser.
Dev server runs on `http://localhost:3001`; it talks to the backend on `http://localhost:3000`.

## How to work in this repo

1. **Explore and reuse before writing.** Look for existing utilities, hooks, providers, and UI
   primitives first. Match the conventions of the surrounding code.
2. **The config files are the rule authority** — don't rely on memory for style rules:
   - `eslint.config.js` — lint + formatting rules (indent, quotes, semicolons, return types,
     self-closing JSX, etc.). **The linter is the source of truth for formatting.**
   - `tsconfig.json` / `tsconfig.paths.json` — strict TypeScript settings and path aliases.
   - `package.json` — available scripts and dependencies.
3. **Run the feedback loop before finishing:** `npm run lint` and `npx jest` (these also run in
   the pre-commit hook and CI, and will block commits if they fail).
4. **Ask the user when a decision is non-obvious** — especially architectural ones (state
   management, new dependencies, cross-cutting structure). Prefer asking over assuming.
5. **Never hand-edit generated code** in `src/api/*` (see Gotchas).

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server (HMR) on `localhost:3001` |
| `npm run build` | Type-check (`tsc -b`) + production build |
| `npm run lint` | Lint `src/`; add `-- --fix` to auto-fix |
| `npm run preview` | Preview the production build |
| `npx jest` | Run unit tests (Jest + jsdom, `*.test.ts(x)`) |
| `npm run cypress:run` | Run Cypress e2e tests (`cypress/e2e`) |
| `npm run api:generate` | Regenerate the API client from the backend OpenAPI spec |

## Architecture map

| Path | Purpose |
|---|---|
| `src/modules/` | Feature pages/areas (hub, projects, project, create/game-editor, profile, help, editor) |
| `src/components/ui/` | Generic design-system **primitives** (Button, TextField, Table) |
| `src/shared/` | **Composite / cross-feature** UI modules + non-UI helpers |
| `src/providers/` | App state: React Context + custom `Destroyable` **provider classes** (not Redux/Zustand) |
| `src/providers/editors/` | Yjs-backed editor providers (Code, Sprite, Map, Sound, Awareness, MultiplayerSettings) |
| `src/hooks/` | Reusable React hooks (`useX`) |
| `src/utils/` | Framework-agnostic utilities |
| `src/theme/` | MUI theme + colors |
| `src/types/` | Shared TypeScript types (`@typedefs/*` alias) |
| `src/errors/` | Custom error classes |
| `src/api/` | **Generated** OpenAPI client — do not edit |
| `lib/` | Standalone libraries |

**State pattern:** complex/shared state lives in provider *classes* implementing `Destroyable`
(observer/listener pattern, Yjs-backed for multiplayer), surfaced through React Context. Study
an existing one (e.g. `src/providers/ProjectProvider.ts`, `src/providers/UserProvider.tsx`)
and reuse the pattern. **Ask before introducing a new state library.**

**Editor layout:** each editor is a folder `editor-name/EditorName.tsx` with co-located
`components/`, `styles/`, `types/`, `constants/` (see `map-editor/`, `sprite-editor/`).

## Conventions (not enforced by tooling — follow these)

These complement the lint/TS rules (which you should read from the config files, not restate).

**Imports — alias policy**
- Use a project `@`-alias for **any cross-directory import**. The project aliases are:
  `@modules`, `@shared`, `@components`, `@providers`, `@hooks`, `@utils`, `@theme`, `@api`,
  `@errors`, `@assets`, `@lib`, `@typedefs` (see `tsconfig.paths.json`).
- **Same-directory `./x` imports are fine** (preferred for siblings within a folder).
- **Don't** use `../` parent-relative imports — use an alias instead.
- **Don't** import via raw `src/...` paths — use the matching `@`-alias (`src/assets/…` →
  `@assets/…`, `src/shared/…` → `@shared/…`, etc.).
- Don't include file extensions in imports (write `"./Music"`, not `"./Music.ts"`).
- Note: npm scoped packages (`@mui/*`, `@emotion/*`, `@monaco-editor/*`) start with `@` but are
  **libraries**, not project imports — see ordering below.

**Imports — ordering** (blank line between each group; alphabetical within each):

```ts
// 1. Project — @-aliases
import { useUser } from "@providers/UserProvider";
import { Hub } from "@modules/hub/Hub";

// 1. Project — same-dir relative
import { EditorTab } from "./EditorType";

// 2. Libraries — react first
import React, { useState } from "react";
import { createRoot } from "react-dom/client";

// 2. Libraries — the rest
import { Box } from "@mui/material";
import axios from "axios";

// 3. Standard TS/JS builtins (rare in browser src)
import { join } from "node:path";

// 4. Styles & assets (last)
import icon from "@assets/icon.svg?react";
import "./Editor.css";
```

**Styling**
- No `!important`. Resolve specificity through MUI's styling system / proper selectors.
- No inline `style={{}}` for non-dynamic styling — use MUI `styled()` or `sx`.
- MUI `styled()` is the standard; avoid new raw `styled-components`.
- Extract non-trivial styled blocks into a co-located `*.styles.ts` file.

**TypeScript**
- Non-null assertions (`!`) are allowed only where a non-null invariant is genuinely clear;
  otherwise prefer narrowing or optional chaining. (`any` is effectively banned — keep it at 0.)

**Logging**
- `console.log` is fine for development — it is stripped from production builds. Use
  `console.warn` / `console.error` for genuine problems.

**Files & folders**
- **Folder names are `kebab-case`** (`game-canvas/`, `auth-overlay/`, `sound-editor/`) — never
  `camelCase` or `PascalCase`. Component files stay `PascalCase` (`GameCanvas.tsx`); hooks and
  utilities stay `camelCase` (`useThing.ts`, `colorUtils.ts`).
- Split files/components by responsibility as they grow; keep one clear responsibility per file.

**TODO / FIXME**
- Reference a Jira ticket: `// TODO(NCTO-123): …`.

**Testing**
- Add unit tests for new pure utilities, hooks, and business logic. UI-heavy code is
  encouraged to have tests but not required.

**Error handling**
- Prefer the custom error classes in `src/errors/` over ad-hoc throws/checks. A top-level
  `ErrorBoundary` (`@components/ui/ErrorBoundary`) wraps the routed app and catches render errors.

**Commits / branches** — see `CONTRIBUTING.md` (branch = Jira key; commit = `[PART] [TYPE] message`).

## Security

See `SECURITY.md` for the disclosure policy. Rules for agents and contributors:

- **No secrets in code or git.** No API keys, tokens, passwords, or credentials in source,
  comments, tests, or fixtures. Browser env vars (`VITE_*`) are bundled and public — never put
  secrets there.
- **Sanitize untrusted HTML** with DOMPurify before rendering; never weaken its config
  (`ADD_TAGS`/`ADD_ATTR`/`ALLOW_*`) to make something work. Avoid `dangerouslySetInnerHTML`
  unless the input is sanitized.
- **Validate redirect/navigation targets** — never navigate to or build URLs from raw user
  input without allow-listing (guards against `javascript:`/open-redirect XSS).
- **Auth tokens**: the app currently stores the token in `localStorage` (XSS-exposed) — this is
  a known issue migrating to httpOnly cookies (`src/shared/authOverlay/AuthOverlay.tsx`). Don't
  add new sensitive data to `localStorage`.
- **Dependencies**: this repo has open Dependabot alerts (see backlog). Before adding or
  bumping a dependency, run `npm audit` and prefer well-maintained, patched versions. Don't
  pin to a version with a known advisory. Keep direct deps (`axios`, `react-router-dom`,
  `vite`) on patched releases.
- **Never disable a security-related lint rule or type check** to silence a warning — fix the
  underlying issue or ask.

## Gotchas

- `src/api/*` is generated by `npm run api:generate` from the backend OpenAPI spec — never edit
  it by hand; it's also ignored by ESLint.
- **fengari** (Lua VM) needs a patch applied via `patch-package` on `postinstall` (run
  `npm install`). Background: `memories/fengari-browser-stub.md`.
- The pre-commit hook runs lint (`--fix`) + Jest and **blocks the commit** on failure.

## Known incoherencies (being addressed in later phases — don't "fix" ad-hoc)

These are tracked cleanups; avoid partial migrations that make them worse.

- **Tooling (Phase 2):** add a `typecheck` script; `package.json` dep cleanup; strip prod
  `console`; `lint-staged` + `commitlint`. Auto-enforce the import convention
  (`simple-import-sort` for ordering; ban `../` and raw `src/...` imports and file extensions),
  and clean up `tsconfig.paths.json` (drop the redundant `src/*` and unused `config/*`/
  `@config/*` mappings; migrate the ~23 `src/...` imports to `@`-aliases).
- **Security (Phase 2):** ~75 open Dependabot alerts. Patch direct deps first (`axios`→≥1.16.0,
  `react-router-dom`→≥7.15.0, `vite`→≥6.4.2), then resolve transitive ones (handlebars,
  dompurify, rollup, …) via `npm audit fix` / `overrides`. Add `.github/dependabot.yml`
  (grouped updates). Secret scanning + CodeQL are enabled; address CodeQL's finding by adding a
  `permissions: { contents: read }` block to `.github/workflows/build.yml`. Migrate the auth
  token off `localStorage` to httpOnly cookies (needs backend support).
- **Structure (Phase 3):**
  - Large files to split: `CodeTabTheme.ts`, `luaLanguageFeatures.ts`, `GameEditor.tsx`.
