import { ApiError } from './api-errors';

/**
 * Narrow a raw client result to its payload, or throw the API error.
 * Shared by every hand-typed call that rides the generated client.
 */
export async function take<T>(
  promise: Promise<{ data?: unknown; error?: unknown; response?: Response }>,
): Promise<T> {
  const result = await promise;
  if (result.error !== undefined || !(result.response?.ok ?? true)) {
    throw ApiError.from(result.response?.status ?? 0, result.error);
  }
  return result.data as T;
}
