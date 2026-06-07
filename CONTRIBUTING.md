# Contribution Guide

follow these conventions when contributing to this repository

# Branch naming

Branches should be named directly from the corresponding Jira task.

(ex. NCTO-7-ide-vs-code-issue)

# Commit naming:
[PART] [TYPE] Commit message

The message after the tags starts with a **capital letter**.

## example:
[COLLAB] [UPDATE] Update imports using @ and improve editor manager cleanup

### PART:
describes what part you're working on in one word

### TYPE:
- [ADD] - adding new features
- [REMOVE] - removing features
- [UPDATE] - updating existing features
- [REFACTO] - refactoring wtihout changing functionality
- [CLEAN] - cleaning dead code, comments, imports, etc.
- [FIX] - fixing bugs

# Commit content:

We use husky to run linter before each commit, so make sure your code is linted if not it will not be committed.

Init husky by doing `npm install` then you can commit.

To check if your code is linted run `npm run lint` or `npm run lint --fix` to fix it automatically simple errors.

# Code conventions

Code style, architecture, and project-structure conventions live in [`AGENTS.md`](./AGENTS.md)
(it applies to both human contributors and AI agents).

`TODO` / `FIXME` comments must reference a Jira ticket, e.g. `// TODO(NCTO-123): ...`.

# Pull Requests
describe what was done.

Use GitHub Copilot as reviewer to generate a summary and suggest edits.

Request at least one reviewer.

After each requested change (review feedback), make a new commit and copy the commit ID into the PR comment.