import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, 'tokens.css'), 'utf8');
const FONTS = resolve(import.meta.dirname, '../../../apps/web/public');

/** Every `--nc-*` declaration inside a block, as a name → value map. */
function tokensOf(marker: string): Record<string, string> {
  const start = css.indexOf(marker);
  expect(start, `${marker} not found in tokens.css`).toBeGreaterThan(-1);
  const block = css.slice(start, css.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/(--nc-[\w-]+)\s*:\s*([^;]+);/g)) {
    out[match[1]!] = match[2]!.trim();
  }
  return out;
}

/** The body of one `@utility`, by its name. */
function utility(name: string): string {
  const start = css.indexOf(`@utility ${name} {`);
  expect(start, `@utility ${name} not found in tokens.css`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('\n}', start));
}

describe('tokens.css', () => {
  const dark = tokensOf('\n:root {');
  const light = tokensOf("\n[data-theme='light'] {");
  const auto = tokensOf('  :root:not([data-theme]) {');

  // The light palette is declared twice — once for the explicit toggle, once for the OS preference
  // — and nothing but this test keeps the two copies identical.
  // A shelf builds the name of each dim layer's mask from its index, so no search finds the four.
  it('declares the four disjoint dither pairs a shelf fades its dim layers in by', () => {
    for (const step of [1, 2, 3, 4]) {
      expect(dark[`--nc-dither-${String(step)}`], `--nc-dither-${String(step)}`).toBeDefined();
    }
  });

  it('keeps the explicit light theme and the OS-preference theme identical', () => {
    expect(auto).toEqual(light);
  });

  it('only overrides tokens in light that actually differ from dark', () => {
    for (const [name, value] of Object.entries(light)) {
      expect(dark, `light defines ${name}, which dark does not`).toHaveProperty(name);
      expect(value, `${name} repeats its dark value in the light theme`).not.toBe(dark[name]);
    }
  });

  it('gives every surface, line and ink a light twin', () => {
    const themed = [
      '--nc-page',
      '--nc-panel',
      '--nc-raised',
      '--nc-inset',
      '--nc-well',
      '--nc-scrim',
      '--nc-skirt',
      '--nc-line',
      '--nc-line-strong',
      '--nc-ink',
      '--nc-ink-body',
      '--nc-ink-2',
      '--nc-ink-3',
      '--nc-ink-4',
      '--nc-gold-ink',
      '--nc-hot-ink',
      '--nc-jade-ink',
      '--nc-sky-ink',
      '--nc-orange-ink',
      '--nc-gold-wash',
      '--nc-hot-wash',
      '--nc-jade-wash',
      '--nc-sky-wash',
      '--nc-primary',
      '--nc-primary-hover',
      '--nc-primary-edge',
      '--nc-primary-skirt',
      '--nc-on-primary',
      '--nc-lit-skirt',
      '--nc-glare',
    ];
    for (const name of themed) {
      expect(light, `${name} has no light value`).toHaveProperty(name);
    }
  });

  // The fills are the palette's own colours and read the same on either ground; only their inks
  // move.
  it('keeps the accent fills identical in both themes', () => {
    for (const name of ['--nc-gold', '--nc-hot', '--nc-jade', '--nc-sky', '--nc-orange']) {
      expect(light, `${name} is re-declared for light`).not.toHaveProperty(name);
    }
  });

  it('follows the gold ink for whatever is active, in both themes', () => {
    expect(dark['--nc-active-ink']).toBe('var(--nc-gold-ink)');
    expect(light).not.toHaveProperty('--nc-active-ink');
  });

  /** Pinned because the button classes carry the token's name, not its number. */
  it('keeps one height ladder', () => {
    expect(dark).toMatchObject({
      '--nc-h-xs': '28px',
      '--nc-h-sm': '30px',
      '--nc-h-md': '36px',
      '--nc-h-lg': '40px',
      '--nc-h-xl': '44px',
      '--nc-h-bar': '48px',
      '--nc-h-hero': '56px',
    });
    const ladder = Object.keys({ ...dark, ...light }).filter((name) => name.startsWith('--nc-h-'));
    expect(ladder).toHaveLength(7);
  });

  it('has no density left', () => {
    expect(css).not.toMatch(/nc-density|--nc-control-|--nc-bar-h|--nc-tool-w|--nc-transport-h/);
    expect(css).not.toContain('@utility control-type');
  });

  it('draws every stroke as a whole number of pixels', () => {
    expect(dark['--nc-px']).toBe('3px');
    const strokes = [
      ...css.matchAll(
        /@property (--bv-(?:t|r|b|l|foot|sink|drop)) \{[^}]*?initial-value: (\d+)px/g,
      ),
    ];
    expect(strokes.map(([, name]) => name)).toHaveLength(7);
    for (const [, name, length] of strokes) {
      expect(Number(length) % 3, `${name!} starts off the pixel grid`).toBe(0);
    }
    // Everything a shape or a state sets on that geometry is the pixel itself, nothing, or another
    // length of the same set.
    const settings = [...css.matchAll(/^\s+(--bv-(?:t|r|b|l|foot|sink|drop)): ([^;]+);/gm)];
    expect(settings.length).toBeGreaterThan(0);
    for (const [, name, value] of settings) {
      expect(value, `${name!} is set off the pixel grid`).toMatch(
        /^(?:var\(--nc-px\)|0px|var\(--bv-rise\))$/,
      );
    }
  });

  it('keeps the focus ring one pixel wide, one pixel away', () => {
    expect(css).toMatch(
      /:focus-visible \{\s*outline: var\(--nc-px\) solid var\(--nc-gold\);\s*outline-offset: var\(--nc-px\);/,
    );
  });

  it('paints every shape from the one bevel, written once', () => {
    const shapes = ['flat-sm', 'flat-lg', 'raised-sm', 'raised-lg', 'well'];
    const names = shapes.map((shape) => `.${shape}`).join(', ');
    expect(css, 'a shape is missing from the rule that paints them').toContain(
      `:where(${names}) {\n    @apply bevel;`,
    );
    for (const shape of shapes) {
      expect(utility(shape), `${shape} carries the strips a second time`).not.toContain('@apply');
      expect(utility(shape)).not.toContain('linear-gradient');
    }
    expect(css.match(/border-image/g)).toBeNull();
  });

  // A bevel inside another must start from nothing, not from its parent's colours.
  it('registers every bevel role so that none inherits', () => {
    for (const role of ['edge', 'hi', 'lo', 'skirt', 'fill']) {
      expect(css).toMatch(
        new RegExp(`@property --bv-${role} \\{\\s*syntax: '<color>';\\s*inherits: false;`),
      );
    }
  });

  it('sweeps a glare only where motion is welcome', () => {
    expect(utility('glare')).toContain(
      '@media (hover: hover) and (prefers-reduced-motion: no-preference)',
    );
    expect(css).toContain('[data-reduce-motion] .glare::after');
  });

  it('ships every face it declares', () => {
    const files = [...css.matchAll(/url\('(\/fonts\/[^']+)'\)/g)].map(([, path]) => path!);
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      expect(existsSync(resolve(FONTS, `.${file}`)), `${file} is declared but not shipped`).toBe(
        true,
      );
    }
  });

  it('gives every text step a distinct value in both themes', () => {
    const steps = ['--nc-ink', '--nc-ink-body', '--nc-ink-2', '--nc-ink-3', '--nc-ink-4'];
    for (const theme of [dark, { ...dark, ...light }]) {
      const ramp = steps.map((name) => theme[name]);
      expect(new Set(ramp).size, `text ramp collapses: ${ramp.join(' ')}`).toBe(ramp.length);
    }
  });
});
