import { unwrap } from '@app/core/api/api-errors';
import {
  aiKeysControllerCreate,
  aiKeysControllerList,
  aiKeysControllerRevoke,
  type AiKeySummaryDto,
} from '@naucto/api-client';
import {
  type CreateQueryResult,
  injectQuery,
  type QueryClient,
} from '@tanstack/angular-query-experimental';

import { qk } from './query-keys';

/**
 * The account's assistant keys.
 *
 * A key is the credential a service holds so nobody re-authorises a client every few hours. It is
 * the account's: it reaches every project the account owns, and a revoked one is gone for good.
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

/** Kills a key everywhere. This is the call a leak is answered with. */
export async function revokeAiKey(keyId: string): Promise<void> {
  unwrap(await aiKeysControllerRevoke({ path: { keyId } }));
}
