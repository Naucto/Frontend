import { TestBed } from '@angular/core/testing';
import { client } from '@naucto/api-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from '../../core/api/api-errors';
import { StaffPreviewService } from './staff-preview.service';

const realFetch = globalThis.fetch;

describe('StaffPreviewService', () => {
  let asked: { method: string; url: string }[];
  let answer: () => Response;
  const service = (): StaffPreviewService => TestBed.inject(StaffPreviewService);

  beforeEach(() => {
    asked = [];
    TestBed.resetTestingModule();
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input);
      const url = new URL(request.url);
      asked.push({ method: request.method, url: url.pathname + url.search });
      return Promise.resolve(answer());
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('reads the latest save of the game, with a GET', async () => {
    answer = () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      });

    await expect(service().content(7)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(asked).toEqual([
      { method: 'GET', url: '/moderation/projects/7/preview/content?source=draft' },
    ]);
  });

  it('reads a game nothing was saved in as no file at all', async () => {
    answer = () => new Response(null, { status: 204 });

    await expect(service().content(7)).resolves.toBeNull();
  });

  it('fails when the server refuses the preview', async () => {
    answer = () =>
      new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });

    await expect(service().content(7)).rejects.toBeInstanceOf(ApiError);
    await expect(service().project(7)).rejects.toBeInstanceOf(ApiError);
  });
});
