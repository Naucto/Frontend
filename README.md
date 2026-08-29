# Naucto — Frontend

Browser fantasy console: make tiny Lua games together, in the browser, and play them with friends.
This monorepo contains the web app (`apps/web`, Angular), the engine (`packages/engine`) and the UI
kit (`packages/ui`). Documentation lives in the `docs/` submodule and is served in-app at `/learn`.

## Prerequisites

- Node 22 (`.nvmrc`), npm ≥ 12
- A GitHub token with `read:packages` for `@naucto/api-client` → `NPM_TOKEN` in `.env`
- The backend running locally (see the Backend repo) or `APP_API_URL` pointing at one

## Getting started

```sh
git clone --recurse-submodules git@github.com:Naucto/Frontend.git
cd Frontend
cp .env.example .env   # fill NPM_TOKEN
npm install
npm start              # http://localhost:3001
```

Other commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run e2e`, `npm run build`.
See `AGENTS.md` for architecture and conventions, `CONTRIBUTING.md` for the workflow.

## License

GPL-3.0 — see `license.txt`.
