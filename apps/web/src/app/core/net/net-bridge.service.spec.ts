import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { client } from '@naucto/api-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppConfigService } from '../config/app-config';
import { PresenceStore } from '../presence/presence.store';
import { NetUiBridgeService } from './net-bridge.service';

const bodies: string[] = [];
const realFetch = globalThis.fetch;

/** Refuses the create, so the assertion is on what went out and no transport is ever opened. */
const stub = async (request: Request): Promise<Response> => {
  bodies.push(await request.text());
  return new Response(JSON.stringify({ message: 'refused' }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
};

describe('NetUiBridgeService.createSession', () => {
  const bridge = (): NetUiBridgeService => TestBed.inject(NetUiBridgeService);

  beforeEach(() => {
    bodies.length = 0;
    TestBed.resetTestingModule();
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = stub as unknown as typeof fetch;
    TestBed.configureTestingModule({
      providers: [
        NetUiBridgeService,
        { provide: AppConfigService, useValue: { reachable: (url: string) => url } },
        { provide: PresenceStore, useValue: { announce: () => undefined } },
        { provide: TranslocoService, useValue: { translate: (key: string) => key } },
      ],
    });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it.each<[string, number, number]>([
    ['above', 64, 16],
    ['below', 1, 2],
    ['between', 6, 6],
  ])(
    'sends a seat count within the endpoint bounds when the game asks %s',
    async (_case, ask, sent) => {
      await bridge()
        .createSession(7, { title: 'Snake', maxPlayers: ask })
        .catch(() => undefined);

      expect(JSON.parse(bodies.join(''))).toMatchObject({ maxPlayers: sent });
    },
  );

  it('marks a room the editor hosts to test its own game', async () => {
    await bridge()
      .createSession(7, { maxPlayers: 2 }, true)
      .catch(() => undefined);
    await bridge()
      .createSession(7, { maxPlayers: 2 })
      .catch(() => undefined);

    expect(bodies.map((body) => (JSON.parse(body) as { editorTest: boolean }).editorTest)).toEqual([
      true,
      false,
    ]);
  });
});

describe('NetUiBridgeService.setListed', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('reports the visibility the server applied, not the one asked for', async () => {
    TestBed.resetTestingModule();
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = (async (request: Request) =>
      new Response(
        request.method === 'GET' ? JSON.stringify({ visibility: 'INVITE_CODE' }) : '{}',
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch;
    TestBed.configureTestingModule({
      providers: [
        NetUiBridgeService,
        { provide: AppConfigService, useValue: { reachable: (url: string) => url } },
        { provide: PresenceStore, useValue: { announce: () => undefined } },
        { provide: TranslocoService, useValue: { translate: (key: string) => key } },
      ],
    });

    await expect(TestBed.inject(NetUiBridgeService).setListed('abc', true)).resolves.toBe(false);
  });
});
