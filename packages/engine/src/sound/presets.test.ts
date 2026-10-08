import { describe, expect, it } from 'vitest';

import { type Bound, INSTRUMENT_BOUNDS, INSTRUMENT_PRESETS, PRESET_FAMILIES } from './presets';

const isBound = (value: unknown): value is Bound =>
  typeof value === 'object' && value !== null && 'min' in value && 'max' in value;

/** Every `(path, value, bound)` a preset has a bound for, however deep the setting sits. */
function* bounded(value: unknown, bounds: unknown, path = ''): Generator<[string, unknown, Bound]> {
  if (isBound(bounds)) {
    yield [path, value, bounds];
    return;
  }
  for (const [key, bound] of Object.entries(bounds as Record<string, unknown>)) {
    const inner = (value as Record<string, unknown> | undefined)?.[key];
    if (inner !== undefined) {
      yield* bounded(inner, bound, path ? `${path}.${key}` : key);
    }
  }
}

describe('instrument presets', () => {
  it.each(INSTRUMENT_PRESETS.map((preset) => [preset.name, preset.settings] as const))(
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
    for (const preset of INSTRUMENT_PRESETS) {
      expect(preset.settings.osc, preset.name).not.toBe('sample');
      expect(preset.settings.sampleId, preset.name).toBeUndefined();
    }
  });

  it('offers each name once', () => {
    const names = INSTRUMENT_PRESETS.map((preset) => preset.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('says what each one is for, and where it is heard', () => {
    for (const preset of INSTRUMENT_PRESETS) {
      expect(preset.blurb.trim().length, preset.name).toBeGreaterThan(0);
      expect(preset.note, preset.name).toBeGreaterThanOrEqual(24);
      expect(preset.note, preset.name).toBeLessThanOrEqual(95);
    }
  });

  it('leaves no family shelf empty', () => {
    for (const family of PRESET_FAMILIES) {
      expect(
        INSTRUMENT_PRESETS.some((preset) => preset.family === family),
        family,
      ).toBe(true);
    }
  });
});
