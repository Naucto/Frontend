---
name: naucto-frontend-change
description: Working method for adding or changing something in the Naucto web app (a page, a component, a request to the backend, a store, a dialog, what a screen does when the server refuses). Use when asked to add or change a feature of the Frontend, to follow a change of the backend's contract, or before opening a pull request on this repository.
---

# Adding or changing something in the Naucto web app

`AGENTS.md` at the repo root is the authority and is not repeated here. Read, before anything
else, its **How to work in this repo**, **Architecture** from _State_ to _Ids_, **Conventions**,
**Security** and **Gotchas**, then the paragraph of the feature you touch (_Netplay_, _Usage
analytics_, _Feedback_, _Moderation_, …): each lists what its code relies on. This file is the
order to do things in.

Two kinds of change have a method of their own, followed with this one:

- a screen or a kit component whose look is not settled: `.claude/skills/naucto-screen-design`;
- anything inside the editor (`features/editor`, `EditableGame`, the work session):
  `.claude/skills/naucto-editor-modes`.

## 1. Find what exists

Search for the noun of the request (`git grep -il <noun> -- apps packages e2e`) before creating
anything.

- **The kit.** `/ui-kit` on a dev server shows every `nc-*` piece in both themes;
  `packages/ui/src/index.ts` lists them.
- **Composites.** `apps/web/src/app/shared`: the disk and the floppy (`game-card`), the game
  screen, the avatar, the person search, the netplay, feedback and moderation dialogs.
- **Requests.** `shared/queries/*.queries.ts` holds the `injectX` helpers, `query-keys.ts` every
  key.
- **Services of the whole app.** `core`: the auth store, the API errors, ids, storage, config
  and feature flags, analytics, presence, notifications.
- **A neighbour.** Open a feature of the same family (`features/collections` is a small, complete
  one: two pages, a dialog in `shared`, its queries, an e2e spec on a mock) and take its shape.

What does the job already is extended. A second helper, a second variant of a component or a
second dialog beside the first is the thing to avoid.

## 2. Put the logic where it belongs

- A page and what only it draws live in `features/<feature>`; a lazy route target is the file's
  default export. What two features use moves to `shared`, what the whole app runs on to `core`.
  `core` and `shared` never import `features`, and `packages/engine` imports no framework: lint
  refuses both. A piece generic enough to be used outside Naucto belongs to the kit.
- Server state is a query (`injectQuery`, `injectMutation`); a mutation invalidates the keys it
  makes stale, by `qk` name. UI state that outlives a component is a SignalStore
  (`*.store.ts`); what one component holds is a signal in it. A copy of server data kept in a
  store goes stale: derive it with `computed`, or hold an edit in progress in a `linkedSignal`.
- What the backend decides stays the backend's: who may, a limit, a count, whether a file fits.
  The page shows the limit the server gave and reads the refusal from the answer. If the page
  needs a value it would have to work out from a list, the route answers it: say so and change
  the backend first.
- If the request does not fit a folder without `core` or `shared` reaching into a feature, or
  one feature into another's internals, stop and ask: that is a decision about structure.

## 3. A request and its failure

1. Call the generated client (`@naucto/api-client`) and unwrap the answer with `unwrap`
   (`core/api/api-errors.ts`), which gives the payload or throws an `ApiError` (`status`,
   `code`, `message`, `violationsOf(error)` for a rejected form).
2. A request more than one screen makes is an `injectX` function in `shared/queries`, with its
   key added to `qk`. An inline `queryKey: [...]` is refused by lint.
3. Decide each failure the person can tell apart. A `code` the contract declares
   (`error instanceof ApiError && error.code === 'PROJECT_HIDDEN'`) or a status that means one
   thing (404) gets its own words. Everything else is a failure that can be tried again:
   `nc-error-state` with `retryLabel` and `(retry)` for a read, a toast for a write. Never
   read an unknown failure as the one you expected. `features/game/game.page.ts` (`failure`,
   `failureTitle`) is the model.
4. A code the page needs and `packages/api-client/openapi.json` does not declare is a change to
   the backend's response schema, made first (step 7).
5. After a refused write the screen shows what the server holds: a control bound to a server
   value is a `linkedSignal` on it, set back in the error path
   (`features/editor/game/publishing.component.ts`).
6. A message is a translated string given to `ToastService` with its tone. The service decides
   how it is shown; `debug` is for what only a developer can act on.
7. A write that asks for an account goes through `GoodStandingAction`
   (`shared/moderation/good-standing-action.ts`): it asks a signed-out reader to sign in over the
   page and tells a suspended account why nothing happens. Nothing else imports
   `SignedInAction` (lint). The control stays enabled: a button greyed out for want of an
   account never says what the rule is.

## 4. Ids

Every id the backend answers is an opaque lower-case UUID string: compared with `===`, never
parsed, ordered to mean older, computed on or shown. `compareIds` (`core/ids/ids.ts`) where two
clients must sort alike, `hashOf` from the kit for a look drawn from an id, `uuidOf(7)`
(`@naucto/api-client/testing`) in a fixture. The player number of a game table
(`PlayerNumber`) is the one integer, and it never names an account. Read _Ids_ in `AGENTS.md`
before touching a route parameter, a sort or anything of netplay.

## 5. The screen

- Compose the kit down to the smallest element and follow **Design rules** in `AGENTS.md`. If
  the design does not draw the screen, or no kit piece fits, follow `naucto-screen-design` before
  writing a template.
- Every string a person reads is a key of `apps/web/public/i18n/en.json`, read with
  `*transloco="let t"` in a template and `TranslocoService.translate` in code. The kit has no
  locale: it takes its words as inputs. Remove a key with its last use.
- A dialog is a component around `nc-dialog-shell`, opened with `DialogService.open`; its
  actions carry the `footer` attribute, the only thing the shell projects into its footer. One
  that a root service or the shell opens is fetched with `import()` when it opens and named by
  `import type` (`shared/moderation/content-flag-launcher.service.ts` is the model).
- A count against a ceiling (characters typed, seats taken, a size against its budget) is
  `t('count', { n, max })`, which reads "3 of 10": never a slash between the two numbers
  (Design rule 7, checked by `pixel:check`).
- A colour is a token, a frame a bevel utility, a size a step of the `--nc-h-*` ladder.
- Reach the document through Angular (`inject(DOCUMENT)`, a template reference, `ElementRef`),
  never through the global.
- Something the product cannot do yet is left out, with its reason under **Deliberate
  divergences**, not shipped as a control that does nothing.

## 6. An editor

Follow `naucto-editor-modes`: every tab is read without being written, and a new write goes
through one of its three doors.

## 7. The contract

1. In the Backend repository, on the branch the change goes with: `npm run generate:swagger`.
2. Copy its `swagger.json` over `packages/api-client/openapi.json`, whole, and run
   `npx prettier --write` on it. Never edit the file by hand, nor anything under
   `packages/api-client/src`.
3. `npm run generate -w @naucto/api-client`, then `npm run typecheck`: the compiler lists what
   the change broke. Read the diff of `openapi.json` too, since a field that became nullable or
   a code that appeared compiles in silence.
4. Start the dev server again; one that was running may still serve the old client.
5. Update the mocks of `e2e/` that answer the routes that changed.

## 8. Tests

- **Unit**, beside the file: `*.spec.ts` in the app and the kit (run by `ng test`), `*.test.ts`
  in the engine (Vitest). A component spec takes `testProviders()` from
  `apps/web/src/app/testing/providers.ts`. One file:
  `npx ng test web --include='apps/web/src/app/<path>.spec.ts' --watch=false`.
- **End to end**, in `e2e/`, on mocks: import `test` and `expect` from `e2e/fixtures.ts`, which
  answers every request off the page's origin with a 404 so no backend that happens to run is
  pictured, then route what the screen asks with the helpers of `e2e/mocks/` (`mockSignedIn`,
  `answer`, `mockHub`, `mockCollections`, `mockModeration`) and `e2e/editor-mocks.ts`. A mock
  that keeps state keeps the server's rules. Cover the failure paths of step 3, not only the
  happy one.
- A rule about the structure of the code is a spec or a lint rule that fails when it is broken
  (`write-doors.spec.ts`, `lazy-dialogs.spec.ts`, the kit's `index.spec.ts`). When one fails,
  what it lists is a decision to take, not a line to edit until it passes.

## 9. Docs

`docs/` is a submodule, rendered at `/learn` and in the editor's DOC tab. A change to the Lua
API (`packages/engine/src/api/luaApiTable.ts`) needs its entry under `docs/api`, or the engine's
parity test (`luaApiTable.docs.test.ts`) fails; a change to an editor or to netplay changes the
pages and captures that show it. If the `naucto-docs` skill is available, follow it; otherwise
`npm run docs:check` and `npm run docs:build`, and say in the pull request which pages are now
behind. Never stage `docs` by accident: its pointer moves in a commit that says so.

## 10. Verify

1. `npm run typecheck`
2. `LC_ALL=C npm test`
3. `npx eslint apps/web packages/engine packages/ui tools e2e`. `npm run lint` reads the whole
   repository, and can exhaust memory while agent worktrees sit beside the sources.
4. `npm run pixel:check && npm run i18n:check && npm run format:check`, and
   `npm run icons:check` after touching a drawing
5. `npx ng build web`: the initial bundle warns at 800 kB and fails at 1 MB, and a static
   import in the wrong place is how it gets there.
6. A dev server of your own, `npx ng serve web --port <free port>` (3001 is the shared default
   and may be serving another tree), then the specs of what you touched:
   `E2E_BASE_URL=http://localhost:<port> npx playwright test --project=chromium <specs>`.
   Always name the project: a bare `npx playwright test` also runs `docs-shots`, which is not a
   test run and rewrites the documentation's captures.
7. Open the screen yourself, in dark and in light, signed out, signed in and with the request
   failing. Lint, typecheck and unit tests see neither a template nor a theme.
8. Stop the dev server.

## 11. Before you open the pull request

- [ ] Nothing the request did not need: no helper with one caller, no second variant, no flag,
      option or `export` nothing reads. The diff touches what it is about.
- [ ] The page checks nothing the server decides, and computes nothing the server could answer.
- [ ] Every failure is narrowed on a declared `code` or an unambiguous status, and everything
      else can be tried again. A refused write leaves the screen as the server has it.
- [ ] A write that asks for an account goes through `GoodStandingAction`.
- [ ] Ids are compared and passed on, nothing more.
- [ ] The kit draws what the kit can draw, each piece used for what it is for, and prose is
      headings and paragraphs. Design rules hold; `pixel:check` owes nothing new.
- [ ] No global `document`; no `[attr.disabled]`; no dialog imported by value into a root
      service.
- [ ] Names say what the thing is. Comments are in English and say why. Every string a person
      reads is in `en.json`.
- [ ] No token in a link acts on an open session, and nothing that must happen once relies on
      a disabled button. A security concern is written with the steps that reproduce it.
- [ ] Specs and e2e mocks come with the change, the checks of step 10 pass, and the pull request
      says one thing: what changed and why, how it was checked, with captures for a screen.
