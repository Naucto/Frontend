import {
  projectContentControllerGetCheckpoints,
  projectContentControllerGetLimits,
  projectContentControllerGetVersions,
  type ProjectLimitsDto,
} from '@naucto/api-client';
import {
  type CreateQueryResult,
  injectQuery,
  type QueryClient,
} from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import { qk } from './query-keys';

/** One saved state of a project, from either history. */
export interface VersionRow {
  /**  */
  key: string;
  name: string;
  when?: string;
  /** True for a named checkpoint, false for an autosave. */
  release: boolean;
}

/** Rows of one history. Both endpoints wrap their list ( */
export const toRows = (
  raw: unknown,
  wrapper: 'versions' | 'checkpoints',
  release: boolean,
): VersionRow[] => {
  const list = Array.isArray(raw)
    ? raw
    : ((raw as Record<string, unknown> | null)?.[wrapper] ?? []);
  if (!Array.isArray(list)) {
    return [];
  }
  const kind = release ? 'checkpoint' : 'autosave';
  return list.map((item: unknown) => {
    const entry =
      typeof item === 'string' ? { name: item } : (item as { name?: string; date?: string });
    const name = entry.name ?? '?';
    return { key: `${kind}:${name}`, name, when: entry.date, release };
  });
};

export function injectProjectVersions(id: () => number): CreateQueryResult<VersionRow[]> {
  return injectQuery(() => ({
    queryKey: qk.projectVersions(id()),
    queryFn: async () =>
      toRows(
        unwrap(await projectContentControllerGetVersions({ path: { id: String(id()) } })),
        'versions',
        false,
      ),
  }));
}

export function injectProjectCheckpoints(id: () => number): CreateQueryResult<VersionRow[]> {
  return injectQuery(() => ({
    queryKey: qk.projectCheckpoints(id()),
    queryFn: async () =>
      toRows(
        unwrap(await projectContentControllerGetCheckpoints({ path: { id: String(id()) } })),
        'checkpoints',
        true,
      ),
  }));
}

/** The ceilings the server holds every project to; set per deployment, hence the long stale time. */
export function injectProjectLimits(): CreateQueryResult<ProjectLimitsDto> {
  return injectQuery(() => ({
    queryKey: qk.projectLimits(),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => unwrap(await projectContentControllerGetLimits()),
  }));
}

/**
 * Drop one of a project's two histories after something wrote to it.
 *
 * Every save lands in `versions` and every checkpoint or publish in `checkpoints`, and a caller
 * that invalidates the wrong one leaves the history panel describing a list nothing has written
 * to.
 */
export function invalidateProjectHistory(
  qc: QueryClient,
  id: number,
  kind: 'versions' | 'checkpoints',
): Promise<void> {
  return qc.invalidateQueries({
    queryKey: kind === 'versions' ? qk.projectVersions(id) : qk.projectCheckpoints(id),
  });
}
