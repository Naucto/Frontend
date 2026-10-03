import { TestBed } from '@angular/core/testing';
import { client } from '@naucto/api-client';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../auth/auth.store';
import { AppConfigService } from '../config/app-config';
import { NotificationsStore } from './notifications.store';

const realFetch = globalThis.fetch;
const sockets: FakeSocket[] = [];

class FakeSocket {
  static readonly OPEN = 1;
  readyState = FakeSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }

  send(): void {}
  close(): void {}
}

/** Hands back a signaling endpoint, the only thing a connect needs before the socket opens. */
const stub = (): Promise<Response> =>
  Promise.resolve(
    new Response(JSON.stringify({ signaling: ['wss://signal.test/socket'] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

describe('NotificationsStore.connect', () => {
  const store = (): InstanceType<typeof NotificationsStore> => TestBed.inject(NotificationsStore);

  beforeEach(() => {
    sockets.length = 0;
    vi.stubGlobal('WebSocket', FakeSocket);
    TestBed.resetTestingModule();
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = stub;
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { isAuthenticated: () => true, accessToken: () => 'tok' } },
        { provide: AppConfigService, useValue: { reachable: (url: string) => url } },
        { provide: QueryClient, useValue: { invalidateQueries: vi.fn() } },
      ],
    });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllGlobals();
  });

  it('opens one socket when a second connect lands before the first has answered', async () => {
    await Promise.all([store().connect(), store().connect()]);

    expect(sockets).toHaveLength(1);
  });
});
