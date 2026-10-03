import { TestBed } from '@angular/core/testing';
import { client } from '@naucto/api-client';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuthStore } from './auth.store';

const answered = new Map<string, (bearer: string | null) => Response>();
let refreshes = 0;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const realFetch = globalThis.fetch;

/** Answers whatever the routes table holds for the path, and 404s everything else. */
const stub = async (request: Request): Promise<Response> => {
  const route = answered.get(new URL(request.url).pathname);
  return route ? route(request.headers.get('Authorization')) : json(404, { message: 'no route' });
};

describe('AuthStore', () => {
  const store = (): InstanceType<typeof AuthStore> => TestBed.inject(AuthStore);

  beforeEach(() => {
    answered.clear();
    refreshes = 0;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: QueryClient, useValue: new QueryClient() }],
    });
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = stub as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('leaves no token behind when the profile cannot be read after a login', async () => {
    answered.set('/auth/login', () => json(201, { access_token: 'tok' }));
    answered.set('/users/profile', () => json(500, { message: 'boom' }));

    await expect(store().loginWithPassword('a@b.test', 'pw')).rejects.toThrow();

    expect(store().accessToken()).toBeNull();
    expect(store().status()).toBe('anonymous');
  });

  it('drops the session when a refresh lands on the account the cookie now belongs to', async () => {
    answered.set('/auth/refresh', () => {
      refreshes += 1;
      return json(200, { access_token: `t${String(refreshes)}` });
    });
    answered.set('/users/profile', (bearer) =>
      bearer === 'Bearer t1'
        ? json(200, { id: 1, username: 'alice', nickname: 'Alice' })
        : json(200, { id: 2, username: 'bob', nickname: 'Bob' }),
    );

    await store().bootstrap();
    expect(store().displayName()).toBe('Alice');

    await expect(store().refresh()).resolves.toBeNull();

    expect(store().status()).toBe('anonymous');
    expect(store().sessionExpired()).toBe(true);
    expect(store().accessToken()).toBeNull();
  });

  const signIn = async (): Promise<void> => {
    answered.set('/auth/refresh', () => {
      refreshes += 1;
      return json(200, { access_token: `t${String(refreshes)}` });
    });
    answered.set('/users/profile', () => json(200, { id: 1, username: 'alice' }));
    await store().bootstrap();
    expect(store().status()).toBe('authenticated');
  };

  it('expires the session when the server refuses the refresh cookie', async () => {
    await signIn();
    answered.set('/auth/refresh', () => json(401, { message: 'Refresh token expired' }));

    await expect(store().refresh()).resolves.toBeNull();

    expect(store().status()).toBe('anonymous');
    expect(store().sessionExpired()).toBe(true);
  });

  it('keeps the session through a refresh the network or the server failed to answer', async () => {
    await signIn();
    answered.set('/auth/refresh', () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(store().refresh()).resolves.toBeNull();
    expect(store().status()).toBe('authenticated');

    answered.set('/auth/refresh', () => json(502, { message: 'Bad Gateway' }));
    await expect(store().refresh()).resolves.toBeNull();
    expect(store().status()).toBe('authenticated');
    expect(store().sessionExpired()).toBe(false);
  });

  it('refreshes and signs out again when the access token had lapsed', async () => {
    await signIn();
    const logouts: (string | null)[] = [];
    answered.set('/auth/logout', (bearer) => {
      logouts.push(bearer);
      return bearer === 'Bearer t2' ? json(200, {}) : json(401, { message: 'Unauthorized' });
    });

    await store().logout();

    expect(logouts).toEqual([null, 'Bearer t2']);
    expect(store().status()).toBe('anonymous');
  });

  it("drops the previous account's cached server state when the session ends", async () => {
    await signIn();
    const queries = TestBed.inject(QueryClient);
    queries.setQueryData(['projects', 'mine'], [{ id: 7 }]);
    answered.set('/auth/logout', () => json(200, {}));

    await store().logout();

    expect(queries.getQueryData(['projects', 'mine'])).toBeUndefined();
  });
});
