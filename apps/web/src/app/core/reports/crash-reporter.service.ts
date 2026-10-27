import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import type { CrashExtraDto, CrashReportDto } from '@naucto/api-client';

import { AnalyticsTransport } from '../analytics/analytics-transport';
import { APP_RELEASE } from '../config/release';
import { pagePath } from './page-path';

/** A tab stuck in a failing loop reports this many crashes, then stops. */
export const CRASHES_PER_TAB = 3;

const NAME_MAX = 120;
const MESSAGE_MAX = 500;
const STACK_MAX = 8_000;

export interface DescribedError {
  name: string;
  message: string;
  stack: string;
}

export function describeError(error: unknown): DescribedError {
  if (error instanceof Error) {
    return { name: error.name || 'Error', message: error.message, stack: error.stack ?? '' };
  }
  return { name: 'Error', message: String(error), stack: '' };
}

/**
 * Sends crashes of the app and faults of the engine, anonymously: through the analytics transport,
 * so without credentials or any identifier, whatever the visitor answered about analytics. A
 * crash goes once per tab, since the server groups them by message anyway.
 */
@Injectable({ providedIn: 'root' })
export class CrashReporter {
  private readonly transport = inject(AnalyticsTransport);
  private readonly document = inject(DOCUMENT);
  private readonly sent = new Set<string>();

  report(source: CrashReportDto['source'], error: unknown, extra?: CrashExtraDto): void {
    try {
      const { name, message, stack } = describeError(error);
      const key = `${name}\n${message}`;
      if (this.sent.has(key) || this.sent.size >= CRASHES_PER_TAB) {
        return;
      }
      this.sent.add(key);
      const body: CrashReportDto = {
        source,
        name: name.slice(0, NAME_MAX),
        message: message.slice(0, MESSAGE_MAX),
        stack: stack.slice(0, STACK_MAX),
        route: pagePath(this.document.location.pathname),
        appRelease: APP_RELEASE,
        ...(extra ? { extra } : {}),
      };
      this.transport.post('/reports/crash', body, { keepalive: true }).catch(() => undefined);
    } catch {
      // A failure to report must never become another error to report.
    }
  }
}
