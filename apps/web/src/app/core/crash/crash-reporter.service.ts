import { inject, Injectable } from '@angular/core';
import type { CrashExtraDto, CrashReportDto } from '@naucto/api-client';

import { AnalyticsTransport } from '../analytics/analytics-transport';
import { AppConfigService } from '../config/app-config';
import { FeaturesService } from '../config/features.service';

/** A tab stuck in a failing loop reports this many crashes, then stops. */
export const CRASHES_PER_TAB = 10;

const NAME_MAX = 120;
const MESSAGE_MAX = 500;
const STACK_MAX = 8_000;
const PATH_MAX = 200;

export interface DescribedError {
  name: string;
  message: string;
  stack: string;
}

export function describeError(error: unknown): DescribedError {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message,
      stack: error.stack ?? '',
    };
  }
  return { name: 'Error', message: String(error), stack: '' };
}

/**
 * The page a crash happened on, as its path alone: a query or a fragment can carry a token, and
 * the server accepts nothing else.
 */
export function crashRoute(url: string): string {
  const path = (url.split(/[?#]/)[0] ?? '').replace(/[^A-Za-z0-9_\-/.:]/g, '');
  return (path.startsWith('/') ? path : `/${path}`).slice(0, PATH_MAX);
}

/** The first frame of a stack, which with the name and message tells one crash from another. */
const firstFrame = (stack: string): string =>
  stack
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('at ') || line.includes('@')) ?? '';

/**
 * Sends crashes of the app and faults of the engine, anonymously: through the analytics transport,
 * so without credentials or any identifier, whatever the visitor answered about analytics. Each
 * crash goes once per tab.
 */
@Injectable({ providedIn: 'root' })
export class CrashReporter {
  private readonly transport = inject(AnalyticsTransport);
  private readonly features = inject(FeaturesService);
  private readonly config = inject(AppConfigService);
  private readonly sent = new Set<string>();

  report(source: CrashReportDto['source'], error: unknown, extra?: CrashExtraDto): void {
    try {
      if (!this.features.feedback()) {
        return;
      }
      const { name, message, stack } = describeError(error);
      const key = `${source}\n${name}\n${message}\n${firstFrame(stack)}`;
      if (this.sent.has(key) || this.sent.size >= CRASHES_PER_TAB) {
        return;
      }
      this.sent.add(key);
      const release = this.config.config().release;
      const body: CrashReportDto = {
        source,
        name: name.slice(0, NAME_MAX),
        message: message.slice(0, MESSAGE_MAX),
        stack: stack.slice(0, STACK_MAX),
        route: crashRoute(location.pathname),
        ...(release ? { appRelease: release } : {}),
        ...(extra ? { extra } : {}),
      };
      this.transport.post('/reports/crash', body, { keepalive: true }).catch(() => undefined);
    } catch {
      // A failure to report must never become another error to report.
    }
  }
}
