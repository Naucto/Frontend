# Fengari Browser Patch

## Project
/home/alexis/Documents/Projets/Naucto/Frontend (React + Vite + TypeScript, Bun)

## Problem
Fengari (Lua VM in JS) uses several Node.js APIs unconditionally that break in the browser:
- `luaconf.js`: `process.env.FENGARICONF` at top level (no guard)
- `luaconf.js`: `require('os').platform()` in an `else if` branch
- `lualib.js`: `require('./liolib.js')` inside a `typeof process` guard — but Vite still bundles it
- `liolib.js`: `require('fs')`, `process.versions.node`, `process.stdin/stdout/stderr`

## Solution
Bun patch at `patches/fengari@0.1.5.patch`, registered in `package.json` under `patchedDependencies`.

### Patch changes:
1. **`luaconf.js`**: Guard `process.env.FENGARICONF` with `typeof process !== "undefined"` check; remove the `require('os')` win32 branch entirely (falls through to the unix `else` branch)
2. **`lualib.js`**: Remove the entire `if (typeof process !== "undefined")` block that loads `liolib.js`
3. **`liolib.js`**: Remove `require('fs')`; remove `process.versions.node` check; replace `process.stdin/stdout/stderr` with `null`; make `g_write` return an error instead of calling `fs.writeSync`

## Notes
- No Vite aliases or `define` needed — the patch fixes the source directly
- `loslib.js` (os lib) is pure JS using only `Date` — no changes needed
- The Lua wrapper lives in `lib/lua.ts` using `LuaEnvironment` class
- After changing the patch, run `npm install` to re-apply it
