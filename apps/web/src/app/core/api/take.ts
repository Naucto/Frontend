import { ApiError } from './api-errors';

/**
 * Narrow a raw client result to its payload, or throw the API error.
 * Shared by every hand-typed call that rides the generated client.
 */
export async function take<T>(
  p: Promise<{ data?: unknown; error?: unknown; response?: Response }>,
): Promise<T> {
  const r = await p;
  const ok = r.response?.ok ?? r.error === undefined;
  if (r.error !== undefined || !ok) {
    const body = r.error as { message?: string | string[] } | undefined;
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : (body?.message ?? r.response?.statusText ?? '');
    throw new ApiError(r.response?.status ?? 0, message || 'Request failed');
  }
  return r.data as T;
}
