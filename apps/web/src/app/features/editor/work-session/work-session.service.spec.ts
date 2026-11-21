import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { client } from '@naucto/api-client';
import { BUBBLEGUM_16, EditableGame, GAME_SCHEMA_VERSION } from '@naucto/engine';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { AppConfigService } from '../../../core/config/app-config';
import { HostElectionService } from './host-election.service';
import { SessionPresenceService } from './session-presence.service';
import { SessionSaveService } from './session-save.service';
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
  palette: [...BUBBLEGUM_16],
  creator: { id: ME },
  collaborators: [],
};

function savedGame(code: string): Uint8Array {
  const doc = new Y.Doc();
  const game = new EditableGame(doc);
  game.seedDefaults();
  const entry = game.entryFile;
  if (!entry) {
    throw new Error('no entry file');
  }
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
  const called = (key: string): Request[] =>
    calls.filter((call) => call.key === key).map((call) => call.req);

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
      'GET /projects/7/content': () =>
        new Response(savedGame('print(1)') as BlobPart, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        }),
      'GET /projects/7': () => json(details),
      'PUT /projects/7': () => json(details),
      'PATCH /projects/7/content': () => json({}),
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
        SessionSaveService,
        HostElectionService,
        SessionPresenceService,
        { provide: AuthStore, useValue: { userId: () => ME, displayName: () => 'me' } },
        { provide: AppConfigService, useValue: { reachable: (url: string) => url } },
        { provide: QueryClient, useValue: { invalidateQueries: () => Promise.resolve() } },
        { provide: TranslocoService, useValue: { translate: (key: string) => key } },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    globalThis.fetch = realFetch;
  });

  describe('a read-only preview', () => {
    const writes = (): string[] =>
      calls.map((call) => call.key).filter((key) => !key.startsWith('GET '));

    beforeEach(() => {
      routes['GET /moderation/projects/7/preview'] = () => json({ ...details, hasRelease: false });
      routes['GET /moderation/projects/7/preview/content'] = () =>
        new Response(savedGame('print(2)') as BlobPart, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        });
    });

    it('opens a game as staff with two reads and no write', async () => {
      const service = TestBed.inject(WorkSessionService);
      await service.openPreview(7, 'staff');

      expect(service.status()).toBe('ready');
      expect(service.readOnly()).toBe(true);
      expect(service.game.entryFile?.text.toString()).toBe('print(2)');
      expect(calls.map((call) => call.key).sort()).toEqual([
        'GET /moderation/projects/7/preview',
        'GET /moderation/projects/7/preview/content',
      ]);
    });

    it('opens a suspended account its own game through the ordinary reads', async () => {
      const service = TestBed.inject(WorkSessionService);
      await service.openPreview(7, 'own');

      expect(service.status()).toBe('ready');
      expect(service.game.entryFile?.text.toString()).toBe('print(1)');
      expect(calls.map((call) => call.key).sort()).toEqual([
        'GET /projects/7',
        'GET /projects/7/content',
      ]);
    });

    it('never counts whoever looks as someone working on the game', async () => {
      const service = TestBed.inject(WorkSessionService);
      await service.openPreview(7, 'own');

      expect(service.isCollaborator()).toBe(false);
      expect(service.playProjectId).toBeNull();
    });

    it('sends nothing for an edit, however long it sits, nor for a forced save', async () => {
      vi.useFakeTimers();
      try {
        const service = TestBed.inject(WorkSessionService);
        const saves = TestBed.inject(SessionSaveService);
        await service.openPreview(7, 'staff');
        calls.length = 0;

        service.game.entryFile?.text.insert(0, '-- looked at\n');
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
        await saves.save({ force: true });
        await saves.saveCheckpoint('kept');

        expect(calls).toHaveLength(0);
        expect(saves.dirty()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('sends nothing when it closes or the tab goes away', async () => {
      const service = TestBed.inject(WorkSessionService);
      await service.openPreview(7, 'staff');
      service.game.entryFile?.text.insert(0, '-- looked at\n');
      calls.length = 0;

      service.onPageHide({ persisted: false } as PageTransitionEvent);
      await service.close();

      expect(writes()).toEqual([]);
      expect(calls).toHaveLength(0);
      expect(service.status()).toBe('closed');
    });
  });
  it('refuses to open, and saves nothing, when the content cannot be fetched', async () => {
    routes['GET /projects/7/content'] = () => json({ message: 'boom' }, 500);
    const service = TestBed.inject(WorkSessionService);
    await service.open(7);
    expect(service.status()).toBe('error');
    expect(called('PATCH /projects/7/content')).toHaveLength(0);
  });

  it('uploads the document while the name is empty, without sending the empty name', async () => {
    routes['PUT /projects/7'] = () => json({ message: ['name should not be empty'] }, 400);
    const service = TestBed.inject(WorkSessionService);
    await service.open(7);
    calls.length = 0;
    const name = service.doc.getText('projectName');
    name.delete(0, name.length);
    await TestBed.inject(SessionSaveService).save();
    expect(called('PATCH /projects/7/content')).toHaveLength(1);
    expect(called('PUT /projects/7')).toHaveLength(0);
  });

  it('writes the palette the game draws with onto the project, when the server holds another', async () => {
    routes['GET /projects/7'] = () => json({ ...details, palette: [] });
    const service = TestBed.inject(WorkSessionService);
    await service.open(7);
    calls.length = 0;
    service.game.setPaletteColour(3, '#ABCDEF');
    await TestBed.inject(SessionSaveService).save();
    const [update] = called('PUT /projects/7');
    const sent = (await update?.json()) as { palette: string[] };
    expect(sent.palette).toEqual(BUBBLEGUM_16.map((colour, i) => (i === 3 ? '#abcdef' : colour)));
  });

  it('keeps an edit made during a save marked dirty', async () => {
    const service = TestBed.inject(WorkSessionService);
    const saves = TestBed.inject(SessionSaveService);
    await service.open(7);
    let land: () => void = () => undefined;
    routes['PATCH /projects/7/content'] = () =>
      new Promise<Response>((resolve) => {
        land = () => {
          resolve(json({}));
        };
      });
    service.game.entryFile?.text.insert(0, '-- a\n');
    const saving = saves.save();
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.game.entryFile?.text.insert(0, '-- b\n');
    land();
    await saving;
    expect(saves.dirty()).toBe(true);
  });

  it('builds nothing once closed while the join is in flight', async () => {
    const join = routes['POST /work-sessions/join/7'];
    let release: () => void = () => undefined;
    routes['POST /work-sessions/join/7'] = (req) =>
      new Promise<Response>((resolve) => {
        release = () => {
          resolve(join?.(req) as Response);
        };
      });
    const service = TestBed.inject(WorkSessionService);
    const presence = TestBed.inject(SessionPresenceService);
    const opening = service.open(7);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const closing = service.close();
    release();
    await Promise.all([opening, closing]);
    expect(presence.awareness()).toBeNull();
    expect(service.status()).toBe('closed');
    expect(called('GET /projects/7/content')).toHaveLength(0);
  });

  it('releases the room before the leave call returns, so the next shell can join it', async () => {
    let release: () => void = () => undefined;
    routes['POST /work-sessions/leave/7'] = () =>
      new Promise<Response>((resolve) => {
        release = () => {
          resolve(json({}));
        };
      });
    const service = TestBed.inject(WorkSessionService);
    const presence = TestBed.inject(SessionPresenceService);
    await service.open(7);
    expect(presence.awareness()).not.toBeNull();
    const closing = service.close();
    expect(presence.awareness()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    await closing;
  });

  it('lets a guest waiting for the host to upgrade the game go when the session closes', async () => {
    routes['POST /work-sessions/join/7'] = () =>
      json({
        hostId: ME + 1,
        roomId: 'room',
        users: [String(ME + 1), String(ME)],
        webrtcOffer: { signaling: [], peerOpts: {}, maxConns: 1 },
      });
    const behind = new Y.Doc();
    Y.applyUpdate(behind, savedGame('print(1)'));
    behind.getMap('game.meta').set('schemaVersion', GAME_SCHEMA_VERSION - 1);
    routes['GET /projects/7/content'] = () =>
      new Response(Y.encodeStateAsUpdate(behind) as BlobPart, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      });
    const service = TestBed.inject(WorkSessionService);
    const opening = service.open(7);
    await vi.waitFor(() => {
      expect(service.status()).toBe('upgrading');
    });
    await Promise.all([opening, service.close()]);
    expect(service.status()).toBe('closed');
  });

  it('leaves a saved game alone when a tutorial seed is waiting', async () => {
    sessionStorage.setItem(
      'naucto.seed.7',
      JSON.stringify({ name: 'Tutorial', code: 'print("tutorial")', assets: null }),
    );
    const service = TestBed.inject(WorkSessionService);
    await service.open(7);
    expect(service.game.entryFile?.text.toString()).toBe('print(1)');
    expect(sessionStorage.getItem('naucto.seed.7')).toBeNull();
  });
});
