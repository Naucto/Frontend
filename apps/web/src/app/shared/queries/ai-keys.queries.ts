import { unwrap } from '@app/core/api/api-errors';
import {
  aiKeysControllerCreate,
  aiKeysControllerGrant,
  aiKeysControllerList,
  aiKeysControllerRevoke,
  aiKeysControllerUngrant,
  type AiKeySummaryDto,
} from '@naucto/api-client';
import {
  type CreateQueryResult,
  injectQuery,
  type QueryClient,
} from '@tanstack/angular-query-experimental';

import { qk } from './query-keys';

/**
 * The account's assistant keys, and the projects each may reach.
 *
 * A key is the credential a service holds so nobody re-authorises a client every few hours. It
 * reaches only the projects listed against it, and a revoked one is gone from here for good.
 */
export function injectAiKeys(): CreateQueryResult<AiKeySummaryDto[]> {
  return injectQuery(() => ({
    queryKey: qk.aiKeys(),
    queryFn: async () => unwrap(await aiKeysControllerList()),
  }));
}

export function invalidateAiKeys(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: qk.aiKeys() });
}

/** Creates a key. The token comes back once and is never retrievable again. */
export async function createAiKey(name: string, expiresInDays: number | null): Promise<string> {
  const created = unwrap(await aiKeysControllerCreate({ body: { name, expiresInDays } }));
  return created.token;
}

export async function grantAiKeyProject(keyId: string, projectId: number): Promise<void> {
  unwrap(await aiKeysControllerGrant({ path: { keyId, projectId } }));
}

export async function ungrantAiKeyProject(keyId: string, projectId: number): Promise<void> {
  unwrap(await aiKeysControllerUngrant({ path: { keyId, projectId } }));
}

/** Kills a key in every project it reaches. This is the call a leak is answered with. */
export async function revokeAiKey(keyId: string): Promise<void> {
  unwrap(await aiKeysControllerRevoke({ path: { keyId } }));
}
