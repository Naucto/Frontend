import { ApiError } from './api-errors';

/**
 * Narrow a raw client result to its payload, or throw the API error.
 * Shared by every hand-typed call that rides the generated client.
 */
export async function take<T>(
  p: Promise<{ data?: unknown; error?: unknown; response?: Response }>,
): Promise<T> {
  const r = await p;
  if (r.error !== undefined || !(r.response?.ok ?? true))
    throw ApiError.from(r.response?.status ?? 0, r.error);
  return r.data as T;
}
