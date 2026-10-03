import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { client } from '@naucto/api-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../auth/auth.store';
import { AppConfigService } from '../config/app-config';
import { FeaturesService } from '../config/features.service';
import { provideApiClient } from './api-client.provider';

interface Call {
  path: string;
  method: string;
  authorization: string | null;
  body: string;
}

const calls: Call[] = [];
const answered = new Map<string, number>();
const refresh = vi.fn(() => Promise.resolve('fresh'));
let inMemory: string | null = 'stale';

const realFetch = globalThis.fetch;

/** Answers 401 once per path — an expired token — and 200 to anything asked a second time. */
async function answer(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  calls.push({
    path,
    method: request.method,
    authorization: request.headers.get('Authorization'),
    body: await request.text(),
  });
  const seen = (answered.get(path) ?? 0) + 1;
  answered.set(path, seen);
  const status = seen === 1 && path !== '/auth/refresh' ? 401 : 200;
  return new Response('{}', { status, headers: { 'content-type': 'application/json' } });
}

describe('provideApiClient', () => {
  // The generated client is a singleton, so a second registration would run the interceptor twice;
  // one TestBed for the file is what keeps a retry to one extra request.
  beforeAll(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideApiClient(),
        {
          provide: AppConfigService,
          useValue: {
            config: () => ({ apiUrl: 'https://api.test' }),
            load: () => Promise.resolve(),
          },
        },
        {
          provide: AuthStore,
          useValue: { accessToken: () => inMemory, refresh, bootstrap: () => Promise.resolve() },
        },
        { provide: FeaturesService, useValue: { load: () => Promise.resolve() } },
      ],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
    TestBed.resetTestingModule();
  });

  beforeEach(() => {
    calls.length = 0;
    answered.clear();
    refresh.mockClear();
    inMemory = 'stale';
    globalThis.fetch = answer as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('re-sends a request that carried a body, once the token is refreshed', async () => {
    const res = await client.post({ url: '/friends/requests', body: { username: 'bob' } });

    expect(res.response?.status).toBe(200);
    expect(calls).toEqual([
      {
        path: '/friends/requests',
        method: 'POST',
        authorization: 'Bearer stale',
        body: '{"username":"bob"}',
      },
      {
        path: '/friends/requests',
        method: 'POST',
        authorization: 'Bearer fresh',
        body: '{"username":"bob"}',
      },
    ]);
  });

  it('leaves a 401 alone while there is no token in memory to refresh', async () => {
    inMemory = null;

    const res = await client.post({ url: '/friends/requests', body: { username: 'bob' } });

    expect(res.response?.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it('leaves a 401 from the auth endpoints alone, so a dead refresh cannot loop', async () => {
    const res = await client.post({ url: '/auth/login', body: { email: 'a@b.c' } });

    expect(res.response?.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });
});
