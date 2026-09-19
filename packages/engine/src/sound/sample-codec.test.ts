import { describe, expect, it } from 'vitest';

import { MAX_SAMPLE_BYTES } from './model';
import { decodeSample, encodeSample, SAMPLE_RATE, toSampleBytes } from './sample-codec';

describe('sample codec', () => {
  it('round-trips audio through base64 within 8-bit resolution', () => {
    const source = Float32Array.from({ length: 128 }, (_, i) => Math.sin(i / 8));
    const pcm = toSampleBytes([source], SAMPLE_RATE);
    const back = decodeSample(encodeSample(pcm));

    expect(back).toHaveLength(source.length);
    for (let i = 0; i < source.length; i++) {
      // One 8-bit step is 1/127; anything worse means the sign handling is wrong.
      expect(Math.abs((back[i] ?? 0) - (source[i] ?? 0))).toBeLessThan(1 / 127 + 1e-6);
    }
  });

  it('keeps negative samples negative', () => {
    // The base64 round-trip goes through charCodeAt, which returns 0..255: the high half has to
    // be read back as the negative range of a signed byte or every trough becomes a peak.
    const pcm = toSampleBytes([Float32Array.from([-1, -0.5, 0, 0.5, 1])], SAMPLE_RATE);
    const back = decodeSample(encodeSample(pcm));

    expect(back[0]).toBeLessThan(-0.9);
    expect(back[1]).toBeLessThan(-0.4);
    expect(back[3]).toBeGreaterThan(0.4);
    expect(back[4]).toBeGreaterThan(0.9);
  });

  it('mixes channels down to mono', () => {
    const left = Float32Array.from([1, 1, 1]);
    const right = Float32Array.from([-1, -1, -1]);

    expect(Array.from(toSampleBytes([left, right], SAMPLE_RATE))).toEqual([0, 0, 0]);
  });

  it('resamples down to the console rate', () => {
    const source = new Float32Array(SAMPLE_RATE * 6); // 6× the target rate, one second of it

    expect(toSampleBytes([source], SAMPLE_RATE * 6)).toHaveLength(SAMPLE_RATE);
  });

  it('never exceeds the byte budget', () => {
    const tenSeconds = new Float32Array(SAMPLE_RATE * 10);

    expect(toSampleBytes([tenSeconds], SAMPLE_RATE).length).toBeLessThanOrEqual(MAX_SAMPLE_BYTES);
  });

  it('returns an empty buffer for anything unreadable', () => {
    expect(decodeSample('not base64 !!')).toHaveLength(0);
    expect(toSampleBytes([], SAMPLE_RATE)).toHaveLength(0);
  });
});
