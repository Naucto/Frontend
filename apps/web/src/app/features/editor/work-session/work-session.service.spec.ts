import { TestBed } from '@angular/core/testing';
import { AuthStore } from '@app/core/auth/auth.store';
import { AppConfigService } from '@app/core/config/app-config';
import { TranslocoService } from '@jsverse/transloco';
import { client } from '@naucto/api-client';
import { Game } from '@naucto/engine';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { WorkSessionService } from './work-session.service';

const realFetch = globalThis.fetch;
const ME = 1;

type Route = (req: Request) => Response | Promise<Response>;

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const details = {
  id: 7,
  name: 'Ferry',
  shortDesc: 'A ferry',
  longDesc: '',
  tags: [],
  creator: { id: ME },
  collaborators: [],
};

function savedGame(code: string): Uint8Array {
  const doc = new Y.Doc();
  const game = new Game(doc);
  game.seedDefaults();
  const entry = game.entryFile;
  if (!entry) throw new Error('no entry file');
  entry.text.delete(0, entry.text.length);
  entry.text.insert(0, code);
  doc.getText('projectName').insert(0, details.name);
  doc.getText('shortDescription').insert(0, details.shortDesc);
  doc.getText('projectTags').insert(0, '[]');
  return Y.encodeStateAsUpdate(doc);
}

describe('WorkSessionService', () => {
  let routes: Record<string, Route>;
  const calls: { key: string; req: Request }[] = [];
  const called = (key: string): Request[] => calls.filter((c) => c.key === key).map((c) => c.req);

  beforeEach(() => {
    calls.length = 0;
    sessionStorage.clear();
    routes = {
      'POST /work-sessions/join/7': () =>
        json({
          hostId: ME,
          roomId: 'room',
          users: [String(ME)],
          webrtcOffer: { signaling: [], peerOpts: {}, maxConns: 1 },
        }),
      'POST /work-sessions/leave/7': () => json({}),
      'GET /projects/7/fetchContent': () =>
        new Response(savedGame('print(1)') as BlobPart, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        }),
      'GET /projects/7': () => json(details),
      'PUT /projects/7': () => json(details),
      'PATCH /projects/7/saveContent': () => json({}),
    };
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const req = new Request(input, init);
      const key = `${req.method} ${new URL(req.url).pathname}`;
      calls.push({ key, req });
      const route = routes[key];
      return Promise.resolve(route ? route(req) : json({}, 404));
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        WorkSessionService,
        { provide: AuthStore, useValue: { userId: () => ME, displayName: () => 'me' } },
        { provide: AppConfigService, useValue: { reachable: (u: string) => u } },
        { provide: QueryClient, useValue: { invalidateQueries: () => Promise.resolve() } },
        { provide: TranslocoService, useValue: { translate: (k: string) => k } },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    globalThis.fetch = realFetch;
  });

  it('refuses to open, and saves nothing, when the content cannot be fetched', async () => {
    routes['GET /projects/7/fetchContent'] = () => json({ message: 'boom' }, 500);
    const s = TestBed.inject(WorkSessionService);
    await s.open(7);
    expect(s.status()).toBe('error');
    expect(called('PATCH /projects/7/saveContent')).toHaveLength(0);
  });

  it('uploads the document while the name is empty, without sending the empty name', async () => {
    routes['PUT /projects/7'] = () => json({ message: ['name should not be empty'] }, 400);
    const s = TestBed.inject(WorkSessionService);
    await s.open(7);
    calls.length = 0;
    const name = s.doc.getText('projectName');
    name.delete(0, name.length);
    await s.save();
    expect(called('PATCH /projects/7/saveContent')).toHaveLength(1);
    expect(called('PUT /projects/7')).toHaveLength(0);
  });

  it('keeps an edit made during a save marked dirty', async () => {
    const s = TestBed.inject(WorkSessionService);
    await s.open(7);
    let land: () => void = () => undefined;
    routes['PATCH /projects/7/saveContent'] = () =>
      new Promise<Response>((r) => {
        land = () => {
          r(json({}));
        };
      });
    s.game.entryFile?.text.insert(0, '-- a\n');
    const saving = s.save();
    await new Promise((r) => setTimeout(r, 0));
    s.game.entryFile?.text.insert(0, '-- b\n');
    land();
    await saving;
    expect(s.dirty()).toBe(true);
  });

  it('builds nothing once closed while the join is in flight', async () => {
    const join = routes['POST /work-sessions/join/7'];
    let release: () => void = () => undefined;
    routes['POST /work-sessions/join/7'] = (req) =>
      new Promise<Response>((r) => {
        release = () => {
          r(join?.(req) as Response);
        };
      });
    const s = TestBed.inject(WorkSessionService);
    const opening = s.open(7);
    await new Promise((r) => setTimeout(r, 0));
    const closing = s.close();
    release();
    await Promise.all([opening, closing]);
    expect(s.awareness).toBeNull();
    expect(s.status()).toBe('closed');
    expect(called('GET /projects/7/fetchContent')).toHaveLength(0);
  });

  it('releases the room before the leave call returns, so the next shell can join it', async () => {
    let release: () => void = () => undefined;
    routes['POST /work-sessions/leave/7'] = () =>
      new Promise<Response>((r) => {
        release = () => {
          r(json({}));
        };
      });
    const s = TestBed.inject(WorkSessionService);
    await s.open(7);
    expect(s.awareness).not.toBeNull();
    const closing = s.close();
    expect(s.awareness).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    release();
    await closing;
  });

  it('leaves a saved game alone when a tutorial seed is waiting', async () => {
    sessionStorage.setItem(
      'naucto.seed.7',
      JSON.stringify({ name: 'Tutorial', code: 'print("tutorial")', assets: null }),
    );
    const s = TestBed.inject(WorkSessionService);
    await s.open(7);
    expect(s.game.entryFile?.text.toString()).toBe('print(1)');
    expect(sessionStorage.getItem('naucto.seed.7')).toBeNull();
  });
});
