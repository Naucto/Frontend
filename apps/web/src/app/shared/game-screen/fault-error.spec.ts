import { describe, expect, it } from 'vitest';

import { faultError } from './fault-error';

describe('faultError', () => {
  it('keeps the stack of a fault that has one', () => {
    const error = faultError({ kind: 'internal', name: 'TypeError', message: 'x', stack: 'at f' });

    expect(error).toMatchObject({ name: 'TypeError', message: 'x', stack: 'at f' });
  });

  it('gives a fault without a stack none, rather than the frames that built it', () => {
    const error = faultError({ kind: 'webgl-context-lost', name: 'WebGlError', message: 'lost' });

    expect(error.stack).toBe('');
  });
});
