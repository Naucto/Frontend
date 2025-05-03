# Contribution Guide

follow these conventions when contributing to this repository

# Branch naming

Branches should be named directly from the corresponding Jira task.

(ex. NCTO-7-ide-vs-code-issue)

# Commit naming:
[PART] [TYPE] commit message

## example:
[COLLAB] [UPDATE] update imports using @ and improve editor manager cleanup

### PART:
describes what part you're working on in one word

### TYPE:
- [ADD] - adding new features
- [REMOVE] - removing features
- [UPDATE] - updating existing features
- [REFACTO] - refactoring wtihout changing functionality
- [CLEAN] - cleaning dead code, comments, imports, etc.
- [FIX] - fixing bugs


# Pull Requests
describe what was done.

Use GitHub Copilot as reviewer to generate a summary and suggest edits.

Request at least one reviewer.

After each requested change (review feedback), make a new commit and copy the commit ID into the PR comment.