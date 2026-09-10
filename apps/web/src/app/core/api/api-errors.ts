/** Normalised error thrown by the API layer so queries and toasts share one shape. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static from(status: number, body: unknown): ApiError {
    if (typeof body === 'object' && body !== null) {
      const b = body as { message?: unknown; error?: unknown; code?: unknown };
      const msg = Array.isArray(b.message)
        ? b.message.join(', ')
        : typeof b.message === 'string'
          ? b.message
          : typeof b.error === 'string'
            ? b.error
            : `HTTP ${String(status)}`;
      return new ApiError(status, msg, typeof b.code === 'string' ? b.code : undefined, body);
    }
    return new ApiError(status, `HTTP ${String(status)}`, undefined, body);
  }
}

/**
 * hey-api types `data` as a status-code map (e.g. `{ 201: { access_token } }`);
 * this resolves it to the payload. Plain DTOs (string keys) pass through.
 */
export type Payload<D> = [keyof D] extends [number] ? D[keyof D] : D;

/** Unwraps a hey-api result ({data, error, response}) into its payload or throws ApiError. */
export function unwrap<R extends { data?: unknown; error?: unknown; response?: Response }>(
  result: R,
): Payload<NonNullable<R['data']>> {
  const status = result.response?.status ?? 0;
  if (result.error !== undefined || !(result.response?.ok ?? false))
    throw ApiError.from(status, result.error);
  return result.data as Payload<NonNullable<R['data']>>;
}

/** One rule a request broke, as the API names it. */
export interface Violation {
  field: string;
  code: string;
}

/**
 * What the API refused, in codes rather than prose.
 *
 * Empty for anything that is not a rejected request, so a caller reads it and falls back to the
 * message without asking what kind of failure it is holding.
 */
export function violationsOf(error: unknown): Violation[] {
  if (!(error instanceof ApiError) || typeof error.body !== 'object' || error.body === null)
    return [];
  const raw: unknown = (error.body as { violations?: unknown }).violations;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is Violation =>
      typeof v === 'object' &&
      v !== null &&
      typeof (v as Violation).field === 'string' &&
      typeof (v as Violation).code === 'string',
  );
}
