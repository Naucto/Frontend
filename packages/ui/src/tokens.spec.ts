import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, 'tokens.css'), 'utf8');

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

describe('tokens.css', () => {
  const dark = tokensOf('\n:root {');
  const light = tokensOf("\n[data-theme='light'] {");
  const auto = tokensOf('  :root:not([data-theme]) {');

  // The light palette is declared twice — once for the explicit toggle, once for the OS
  // preference. They drifted apart before (the light ink ramp lost a step), so pin them together.
  it('keeps the explicit light theme and the OS-preference theme identical', () => {
    expect(auto).toEqual(light);
  });

  it('only overrides tokens in light that actually differ from dark', () => {
    for (const [name, value] of Object.entries(light)) {
      expect(dark, `light defines ${name}, which dark does not`).toHaveProperty(name);
      expect(value, `${name} repeats its dark value in the light theme`).not.toBe(dark[name]);
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
