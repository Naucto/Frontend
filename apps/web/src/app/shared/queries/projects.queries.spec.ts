import { QueryClient } from '@tanstack/angular-query-experimental';
import { describe, expect, it, vi } from 'vitest';

import { invalidateProjectHistory, toRows } from './projects.queries';
import { qk } from './query-keys';

describe('toRows', () => {
  it('keys a checkpoint apart from an autosave of the same name', () => {
    const name = '1742901234567';
    const [checkpoint] = toRows({ checkpoints: [{ name, date: '' }] }, 'checkpoints', true);
    const [autosave] = toRows({ versions: [{ name, date: '' }] }, 'versions', false);
    expect(checkpoint?.name).toBe(name);
    expect(autosave?.name).toBe(name);
    expect(checkpoint?.key).not.toBe(autosave?.key);
  });

  it('reads the wrapped list the contract answers, and a bare one', () => {
    const wrapped = toRows({ versions: [{ name: 'a', date: '2026-09-11' }] }, 'versions', false);
    expect(wrapped).toEqual([{ key: 'autosave:a', name: 'a', when: '2026-09-11', release: false }]);
    expect(toRows([], 'versions', false)).toEqual([]);
    expect(toRows([{ name: 'b' }], 'checkpoints', true)).toEqual([
      { key: 'checkpoint:b', name: 'b', when: undefined, release: true },
    ]);
  });

  it('answers nothing for a shape it does not know, rather than throwing', () => {
    expect(toRows(null, 'versions', false)).toEqual([]);
    expect(toRows({ versions: 'nope' }, 'versions', false)).toEqual([]);
  });
});

describe('invalidateProjectHistory', () => {
  it('invalidates the one history that was written to', async () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);

    await invalidateProjectHistory(qc, 7, 'versions');
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: qk.projectVersions(7) });

    await invalidateProjectHistory(qc, 7, 'checkpoints');
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: qk.projectCheckpoints(7) });
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
