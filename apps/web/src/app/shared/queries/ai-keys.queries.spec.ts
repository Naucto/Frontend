import { QueryClient } from '@tanstack/angular-query-experimental';
import { describe, expect, it, vi } from 'vitest';

import { invalidateAiKeys } from './ai-keys.queries';
import { qk } from './query-keys';

describe('invalidateAiKeys', () => {
  it('invalidates the account key list, so a grant or a revoke shows up', async () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);

    await invalidateAiKeys(qc);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.aiKeys() });
  });

  it('keys on the account, not on a project: a key reaches several at once', () => {
    // A key granted to two projects is still one row in the list, so the key must not carry a
    // project id or granting a second project would leave the first tab showing a stale list.
    expect(qk.aiKeys()).toEqual(['ai', 'keys']);
  });
});
