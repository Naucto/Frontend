import { TestBed } from '@angular/core/testing';
import { client } from '@naucto/api-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FeaturesService } from './features.service';

const realFetch = globalThis.fetch;

const answer = (status: number, body: unknown): void => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
};

describe('FeaturesService', () => {
  const service = (): FeaturesService => TestBed.inject(FeaturesService);

  beforeEach(() => {
    TestBed.resetTestingModule();
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('keeps every flag off until the server answers', () => {
    expect(service().monetization()).toBe(false);
    expect(service().analytics()).toBe(false);
  });

  it('reads each flag from the server', async () => {
    answer(200, { monetization: false, analytics: true });

    await service().load();

    expect(service().analytics()).toBe(true);
    expect(service().monetization()).toBe(false);
  });

  it('keeps every flag off when the server cannot answer', async () => {
    answer(500, { message: 'boom' });

    await service().load();

    expect(service().analytics()).toBe(false);
  });

  it('turns analytics off alone when the server says so later', async () => {
    answer(200, { monetization: true, analytics: true });
    await service().load();

    service().disableAnalytics();

    expect(service().analytics()).toBe(false);
    expect(service().monetization()).toBe(true);
  });
});
