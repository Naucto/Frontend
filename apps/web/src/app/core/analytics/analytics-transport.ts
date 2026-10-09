import { inject, Injectable } from '@angular/core';
import type { AnalyticsRotationDto } from '@naucto/api-client';

import { AppConfigService } from '../config/app-config';
import type { CookieJar } from '../storage/cookies';
import type { AnalyticsIdentity } from './visitor';
import { currentIdentity, rotateSession, rotateVisitor } from './visitor';

/** Every request a page closing sends shares this budget, which browsers cap at 64 KiB in all. */
export const KEEPALIVE_BUDGET_BYTES = 32 * 1024;

export type AnalyticsPath =
  | '/analytics/events'
  | '/analytics/play'
  | '/analytics/beat'
  | '/analytics/ping'
  | `/projects/releases/${string}/view`;

/** A report the server could not take for now; worth sending again later. */
export class TransientTransportError extends Error {}

/**
 * Sends usage reports. JSON goes as text/plain without credentials, which makes a simple request:
 * the browser sends it without a preflight, so it can leave as a page closes, and it never carries
 * the account. Attribution happens only through the visitor link.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsTransport {
  private readonly config = inject(AppConfigService);

  /**
   * Resolves the parsed answer, or null when there is none or the request was refused, since a
   * refused request would be refused again. Rejects when the network or the server failed.
   */
  async post<T>(
    path: AnalyticsPath,
    body: unknown,
    options: { keepalive?: boolean } = {},
  ): Promise<T | null> {
    const text = JSON.stringify(body);
    let response: Response;
    try {
      response = await fetch(`${this.config.config().apiUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
        credentials: 'omit',
        keepalive: options.keepalive === true && text.length <= KEEPALIVE_BUDGET_BYTES,
      });
    } catch (error) {
      throw new TransientTransportError(String(error));
    }
    if (response.status >= 500) {
      throw new TransientTransportError(`HTTP ${String(response.status)}`);
    }
    if (!response.ok || response.status === 204) {
      return null;
    }
    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }
}

export type RotationOutcome = 'none' | 'visitor' | 'session' | 'stale';

/**
 * Applies a rotation answer to the cookies, but only while they still hold the identity the
 * request carried. Another tab or a later answer may already have moved on, and rotating again
 * would throw away an identity the server accepted.
 */
export function applyRotation(
  sent: AnalyticsIdentity,
  answer: Pick<AnalyticsRotationDto, 'rotateVisitor' | 'rotateSession'>,
  jar: CookieJar = document,
): RotationOutcome {
  if (!answer.rotateVisitor && !answer.rotateSession) {
    return 'none';
  }
  const now = currentIdentity(jar);
  if (answer.rotateVisitor) {
    if (now?.visitorId !== sent.visitorId) {
      return 'stale';
    }
    rotateVisitor(jar);
    return 'visitor';
  }
  if (now?.visitorId !== sent.visitorId || now.sessionId !== sent.sessionId) {
    return 'stale';
  }
  rotateSession(jar);
  return 'session';
}
