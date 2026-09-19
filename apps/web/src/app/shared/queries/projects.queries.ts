import { unwrap } from '@app/core/api/api-errors';
import {
  projectControllerGetCheckpoints,
  projectControllerGetLimits,
  projectControllerGetVersions,
  type ProjectLimitsDto,
} from '@naucto/api-client';
import {
  type CreateQueryResult,
  injectQuery,
  type QueryClient,
} from '@tanstack/angular-query-experimental';

import { qk } from './query-keys';

/** One saved state of a project, from either history. */
export interface VersionRow {
  /**
   * `checkpoint:<name>` or `autosave:<name>`.
   *
   * The two histories are separate namespaces, so a checkpoint may carry the same name as an
   * autosave — `1742901234567` is a legal name for both — and a list that told its rows apart by
   * name alone held two rows under one key.
   */
  key: string;
  name: string;
  when?: string;
  /** True for a named checkpoint, false for an autosave. */
  release: boolean;
}

/**
 * Both endpoints wrap their list (`{ versions }` / `{ checkpoints }`). A bare list is read too: it
 * costs one line, and it is what a fixture written before the wrapper answers, which would
 * otherwise show as an empty history rather than as a wrong fixture.
 */
export const toRows = (
  raw: unknown,
  wrapper: 'versions' | 'checkpoints',
  release: boolean,
): VersionRow[] => {
  const list = Array.isArray(raw)
    ? raw
    : ((raw as Record<string, unknown> | null)?.[wrapper] ?? []);
  if (!Array.isArray(list)) return [];
  const kind = release ? 'checkpoint' : 'autosave';
  return list.map((v: unknown) => {
    const o = typeof v === 'string' ? { name: v } : (v as { name?: string; date?: string });
    const name = o.name ?? '?';
    return { key: `${kind}:${name}`, name, when: o.date, release };
  });
};

export function injectProjectVersions(id: () => number): CreateQueryResult<VersionRow[]> {
  return injectQuery(() => ({
    queryKey: qk.projectVersions(id()),
    queryFn: async () =>
      toRows(
        unwrap(await projectControllerGetVersions({ path: { id: String(id()) } })),
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
        unwrap(await projectControllerGetCheckpoints({ path: { id: String(id()) } })),
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
    queryFn: async () => unwrap(await projectControllerGetLimits()),
  }));
}

/**
 * Drop one of a project's two histories after something wrote to it.
 *
 * Every save lands in `versions` and every checkpoint or publish in `checkpoints`, from four places
 * that used to spell the key by hand — and one of them, the autosave, never invalidated at all, so
 * the panel showed the list as it was when the editor opened.
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
