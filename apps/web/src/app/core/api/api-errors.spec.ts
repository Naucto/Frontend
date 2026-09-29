import { describe, expect, it } from 'vitest';

import { ApiError, isWorthRetrying } from './api-errors';

describe('isWorthRetrying', () => {
  it('retries what the moment rather than the bytes decided', () => {
    // A busy save queue, a store that stalled, a connection that dropped, a deploy in progress.
    // Sending the same bytes again can only help.
    expect(isWorthRetrying(new ApiError(503, 'Too many saves'))).toBe(true);
    expect(isWorthRetrying(new ApiError(500, 'boom'))).toBe(true);
    expect(isWorthRetrying(new ApiError(502, 'bad gateway'))).toBe(true);
    expect(isWorthRetrying(new ApiError(408, 'timeout'))).toBe(true);
    expect(isWorthRetrying(new ApiError(429, 'slow down'))).toBe(true);
    expect(isWorthRetrying(new Error('network error'))).toBe(true);
  });

  it('does not retry what the server has already answered about these bytes', () => {
    // The same bytes sent again are refused the same way, so retrying only burns the store and the
    // tab — and, worse, burns the retry budget a transient failure would have wanted.
    expect(isWorthRetrying(new ApiError(400, 'not a game document'))).toBe(false);
    expect(isWorthRetrying(new ApiError(413, 'past the maximum size'))).toBe(false);
    expect(isWorthRetrying(new ApiError(422, 'file validation failed'))).toBe(false);
    expect(isWorthRetrying(new ApiError(403, 'forbidden'))).toBe(false);
  });
});
