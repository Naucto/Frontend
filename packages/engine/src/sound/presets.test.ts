import { describe, expect, it } from 'vitest';

import { type Bound, INSTRUMENT_BOUNDS, INSTRUMENT_PRESETS } from './presets';

const isBound = (v: unknown): v is Bound =>
  typeof v === 'object' && v !== null && 'min' in v && 'max' in v;

/** Every `(path, value, bound)` a preset has a bound for, however deep the setting sits. */
function* bounded(value: unknown, bounds: unknown, path = ''): Generator<[string, unknown, Bound]> {
  if (isBound(bounds)) {
    yield [path, value, bounds];
    return;
  }
  for (const [key, bound] of Object.entries(bounds as Record<string, unknown>)) {
    const inner = (value as Record<string, unknown> | undefined)?.[key];
    if (inner !== undefined) yield* bounded(inner, bound, path ? `${path}.${key}` : key);
  }
}

describe('instrument presets', () => {
  it.each(INSTRUMENT_PRESETS.map((p) => [p.name, p.settings] as const))(
    '%s can be reached from the inspector',
    (_name, settings) => {
      for (const [path, value, { min, max }] of bounded(settings, INSTRUMENT_BOUNDS)) {
        expect(value, path).toBeTypeOf('number');
        expect(value, path).toBeGreaterThanOrEqual(min);
        expect(value, path).toBeLessThanOrEqual(max);
      }
    },
  );

  it('never asks for a sample', () => {
    for (const p of INSTRUMENT_PRESETS) {
      expect(p.settings.osc, p.name).not.toBe('sample');
      expect(p.settings.sampleId, p.name).toBeUndefined();
    }
  });

  it('offers each name once', () => {
    const names = INSTRUMENT_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
