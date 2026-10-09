# design-sync notes

- **Tokens-only sync, by decision (2026-10-09).** The `nc-*` kit is Angular and Claude Design only takes React, so
  no components ship. Alexis chose tokens + conventions over an `@angular/elements` + React-wrapper bridge, which
  would mean a new dependency, a separate build target, and directives and services (`ncButton`, tooltip,
  dialog, toast) that don't map to elements. Revisit only if that trade changes.
- **The stylesheet is compiled, not copied.** `tokens.css` is Tailwind v4 input (`@theme`, `@utility`).
  `build-css.mjs` (`cfg.buildCmd`) compiles it with `@tailwindcss/node` and scans `packages/ui/src` and `apps/web/src`
  for candidate classes, so the shipped utilities are exactly the app's vocabulary. Output: `.ds-sync/naucto.css`
  (`cfg.cssEntry`). It rewrites `/fonts/` urls to `apps/web/public/fonts` so the converter copies the two faces.
- **Entry** is `.design-sync/entry.mjs`, re-exporting the framework-free palette helpers (`IDENTITY_COLOURS`,
  `colourOf`, `inkFor`). No PascalCase exports, so the converter goes tokens-only (`[ZERO_MATCH]` is expected).
- **React is installed into `.ds-sync/` only** (`npm i react@19 react-dom@19` there), for the `_vendor/` runtime.
  Pass `--node-modules ./.ds-sync/node_modules`. `[DTS_REACT]` is irrelevant with zero components.
- `guidelinesGlob: []`: the default glob caught `docs/README.md`, the engine-docs submodule, which is not design guidance.
- **Theme.** Without `data-theme`, the kit follows the OS setting, so a headless browser renders light. The header
  tells the agent to set `data-theme="dark"`. Buttons carry a 100ms colour transition: screenshot only after the
  theme is set at load, never right after flipping it.

Build:

```sh
node .design-sync/build-css.mjs
node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules ./.ds-sync/node_modules \
  --entry .design-sync/entry.mjs --out ./ds-bundle [--remote .design-sync/.cache/remote-sync.json]
```

## Re-sync risks

- A new token or utility in the kit reaches the bundle only after `build-css.mjs` reruns.
- `conventions.md` hardcodes the kit's button, panel, input and field class strings. They drift if
  `button.directive.ts`, `panel.component.*`, `input.directive.ts` or `field.component.html` change: re-grep them.
- The header's class names were verified against `_ds_bundle.css` on 2026-10-09. Re-verify on every sync.
- The generated README body still says "React library, 0 components". The header overrides it, but there is no
  knob to drop that text.
