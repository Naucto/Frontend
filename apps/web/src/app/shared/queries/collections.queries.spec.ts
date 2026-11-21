import { describe, expect, it } from 'vitest';

import { ApiError } from '../../core/api/api-errors';
import { limitOf } from './collections.queries';

describe('limitOf', () => {
  const refusal = (code: string, max: unknown): ApiError =>
    ApiError.from(400, { statusCode: 400, error: 'Bad Request', message: 'Full', code, max });

  it('reads the count out of the limit it is asked about', () => {
    expect(limitOf(refusal('COLLECTIONS_LIMIT', 50), 'COLLECTIONS_LIMIT')).toBe(50);
    expect(limitOf(refusal('COLLECTION_GAMES_LIMIT', 200), 'COLLECTION_GAMES_LIMIT')).toBe(200);
  });

  it('is null for the other limit, for a refusal without a count and for any other failure', () => {
    expect(limitOf(refusal('COLLECTIONS_LIMIT', 50), 'COLLECTION_GAMES_LIMIT')).toBeNull();
    expect(limitOf(refusal('COLLECTIONS_LIMIT', 'many'), 'COLLECTIONS_LIMIT')).toBeNull();
    expect(limitOf(ApiError.from(500, null), 'COLLECTIONS_LIMIT')).toBeNull();
    expect(limitOf(new Error('offline'), 'COLLECTIONS_LIMIT')).toBeNull();
  });
});
