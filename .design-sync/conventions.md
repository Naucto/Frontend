# Naucto — read this first

Naucto is a fantasy console: a retro game editor and hub. Its look is dark, set in a pixel face, uses warm greys with a few saturated accents, and has square-ish corners.

**There are no components in this bundle.** Naucto's real `nc-*` kit is Angular, and Claude Design runs React, so the components list below is empty on purpose. What ships is the kit's **compiled stylesheet**: its tokens, its two fonts, and every utility class the app uses. Build your own React markup and style it only with that vocabulary. `window.Naucto` exposes three framework-free helpers from the kit: `IDENTITY_COLOURS` (the 16-colour identity palette), `colourOf(key)` (a stable palette colour for a user or game id) and `inkFor(fill)` (light or dark ink that stays legible on that fill).

## Setup

Link `styles.css` once and nothing else. It sets the page background, ink and font on `html` and `body`. Naucto's look is dark: put `data-theme="dark"` on `<html>`. Without the attribute, the theme follows the viewer's OS setting. Use `data-theme="light"` only when a light screen is asked for, and never hand-pick light colours, because every token flips with the theme.

## Styling idiom: Tailwind v4 utilities, Naucto tokens only

The default Tailwind palette, fonts and radii are **removed**, so `bg-gray-800`, `text-white` and `rounded-lg` resolve to nothing. Read `styles.css` → `_ds_bundle.css` for the full list. Only class names that appear there exist.

- **Spacing is 8px per step**: `p-1` = 8px, `p-2` = 16px, `gap-0.5` = 4px. Arbitrary values (`h-[32px]`) are fine, but only if they appear in the stylesheet.
- **Surfaces** (darkest to lightest): `bg-inset`, `bg-page`, `bg-sunken`, `bg-panel`, `bg-raised`. The green screen readout is `bg-lcd` with `text-lcd-ink`.
- **Ink** (strongest to faintest): `text-ink`, `text-ink-body`, `text-ink-2`, `text-ink-3`, `text-ink-4`.
- **Lines**: `border-line` (default), `border-line-strong` (controls), `border-line-soft`.
- **Accents**: `gold` (primary or selected), `hot` (run, danger, error), `jade` (online, success), `sky` (info), `orange` (primary hover). Use `bg-<accent>` for fills and `text-<accent>-ink` for accent-coloured text. Text on an accent fill is `text-on-accent`, or `text-on-accent-dark` on `hot`.
- **Type**: `text-label` 10, `text-meta` 11, `text-body` 12, `text-ui` 13, `text-title` 16, `text-display` 24, `text-hero` 30 (all px). The faces are `font-ui` (HD44780) and `font-mono` (HD44780 Mono). Use the `label` class for every caption and section title: mono, 10px, uppercase, tracked, `ink-3`. Buttons and headings are `uppercase`.
- **Radius**: `rounded-xs` 2px, `rounded-sm` 3px (controls), `rounded-md` 4px (panels, cards). Nothing rounder exists.
- **Other utilities**: `pixelated` (sprite art), `scanlines` (veil over a game canvas), `no-cover` (hatch for a game without a cover). For editor-style toolbars, put `nc-density-big` on the container, size controls with `h-(--nc-control-h)` and set their text with `control-type`.

## Recipes (the kit's own class strings)

- **Button base**: `inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-sm border font-ui uppercase tracking-button h-[32px] px-2 text-body`
  - primary: `bg-gold border-gold text-on-accent hover:bg-orange hover:border-orange`
  - run: `bg-hot border-hot text-on-accent-dark`
  - secondary: `bg-raised border-line-strong text-ink-body hover:text-ink hover:border-ink-4`
  - ghost: `bg-transparent border-transparent text-ink-2 hover:text-ink hover:bg-raised`
  - danger: `bg-transparent border-hot-ink text-hot-ink hover:bg-hot hover:text-on-accent-dark`
- **Panel**: `rounded-md border border-line bg-panel`. Its header is `flex h-4 items-center justify-between border-b border-line px-2`, holding a `label`. Its body is `p-2`.
- **Input**: `block w-full rounded-sm border border-line-strong bg-inset px-1.5 py-1 font-ui text-body text-ink placeholder:text-ink-4 focus:border-gold focus:outline-none`
- **Field**: a `label` above the control with `mb-1`. A hint below is `mt-0.5 text-meta text-ink-3`, an error is `mt-0.5 text-meta text-hot-ink`.

```jsx
<section className="rounded-md border border-line bg-panel">
  <header className="flex h-4 items-center justify-between border-b border-line px-2">
    <span className="label">New game</span>
  </header>
  <div className="flex flex-col gap-2 p-2">
    <label className="label mb-1" htmlFor="t">
      Title
    </label>
    <input
      id="t"
      className="block w-full rounded-sm border border-line-strong bg-inset px-1.5 py-1 font-ui text-body text-ink focus:border-gold focus:outline-none"
    />
    <button className="inline-flex h-[32px] items-center justify-center gap-1 rounded-sm border bg-gold border-gold px-2 font-ui text-body uppercase tracking-button text-on-accent hover:bg-orange">
      Create
    </button>
  </div>
</section>
```
