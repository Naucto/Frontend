# Security Policy

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report suspected vulnerabilities privately via GitHub's
[Report a vulnerability](https://github.com/Naucto/Frontend/security/advisories/new) flow
(Security → Advisories), or by contacting the maintainers directly.

When reporting, include where possible: affected version/commit, a description of the issue and
its impact, and reproduction steps or a proof of concept. We aim to acknowledge reports
promptly and will coordinate disclosure once a fix is available.

## Supported versions

This is an actively developed application; security fixes target the `main` branch. There are
no separately maintained release branches.

## Dependency & code security

- **Dependabot alerts** are enabled. Direct dependencies (`axios`, `react-router-dom`, `vite`)
  are kept on patched releases; transitive advisories are resolved via updates, `npm audit fix`,
  or `overrides`. Run `npm audit` before adding or bumping a dependency.
- **No secrets in the repo.** Credentials, tokens, and keys must never be committed. Browser
  env vars (`VITE_*`) are bundled into the client and are public — never store secrets there.
- Untrusted HTML must be sanitized (DOMPurify); user-controlled navigation targets must be
  validated. See the Security section of [`AGENTS.md`](./AGENTS.md) for contributor guidance.

## Known issues being addressed

- Auth token is currently stored in `localStorage` (exposed to XSS); migration to httpOnly
  cookies is planned (requires backend support).
- A backlog of open Dependabot advisories is being remediated — see the Security backlog in
  [`AGENTS.md`](./AGENTS.md).
