# Contributing

1. **Branch** from `main`, named after the Jira key: `NCTO-123-short-description`.
2. **Stacked PRs**: use `gh stack` (`gh stack init <branch>` → commit → `gh stack add <next>` →
   `gh stack submit --auto`). Each PR must build and pass CI on its own.
3. **Commits**: `[PART] [TYPE] Capitalized message` — TYPE ∈ `ADD REMOVE UPDATE REFACTO CLEAN FIX`,
   PART ∈ `FRONTEND ENGINE UI DOCS TOOLING` (enforced by commitlint). One logical change per commit.
4. **Before pushing**: `npm run lint && npm run typecheck && npm test` (the pre-commit hook runs
   lint-staged; CI runs everything plus Playwright).
5. **Pull requests**: fill the template, attach screenshots for UI work, request at least one human
   reviewer, answer each review round with a new commit (no force-push once reviewed).
6. **Docs**: if you change the engine API, update `docs/` (the submodule) and bump its pointer in the
   same PR; the parity test fails otherwise. A change under `packages/engine/src/api`,
   `apps/web/src/app/features/editor` or `apps/web/src/app/shared/netplay` runs `ndc map <files>`
   from the `naucto-docs` skill (`~/.claude/skills/naucto-docs/bin/ndc`) and updates the pages it
   names; `npm run docs:shots` retakes the captures.
