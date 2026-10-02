import { QueryClient } from '@tanstack/angular-query-experimental';
import { describe, expect, it, vi } from 'vitest';

import { invalidateAiKeys } from './ai-keys.queries';
import { qk } from './query-keys';

describe('invalidateAiKeys', () => {
  it('invalidates the account key list, so a create or a revoke shows up', async () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);

    await invalidateAiKeys(qc);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.aiKeys() });
  });

  it('keys on the account, not on a project: a key belongs to the account', () => {
    // A key reaches every project the account owns, so its list has no project in it to go stale.
    expect(qk.aiKeys()).toEqual(['ai', 'keys']);
  });
});
