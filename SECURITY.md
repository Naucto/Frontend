# Security policy

Report vulnerabilities privately through GitHub Security Advisories on this repository. Only `main`
is supported. Do not open public issues for security problems.

Rules for contributors: no secrets or tokens in the repo (use `.env`, BuildKit secrets in Docker);
access tokens live in memory only; sanitise untrusted HTML; validate navigation targets; keep
dependencies patched (Dependabot is enabled); never disable a security lint rule to make something
pass.
