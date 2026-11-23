import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { client } from '@naucto/api-client';
import { BUBBLEGUM_16, EditableGame, GAME_SCHEMA_VERSION } from '@naucto/engine';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { AuthStore } from '../../../core/auth/auth.store';
import { AppConfigService } from '../../../core/config/app-config';
import { CrashReporter } from '../../../core/reports/crash-reporter.service';
import { EditorModeService } from '../state/editor-mode.service';
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
  let staff: boolean;
  let suspended: boolean;
  const report = vi.fn();

  beforeEach(() => {
    calls.length = 0;
    staff = false;
    suspended = false;
    report.mockClear();
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
        EditorModeService,
        WorkSessionService,
        SessionSaveService,
        HostElectionService,
        SessionPresenceService,
        {
          provide: AuthStore,
          useValue: {
            userId: () => ME,
            displayName: () => 'me',
            isStaff: () => staff,
            suspension: () =>
              suspended ? { since: '2026-11-01T00:00:00.000Z', until: null } : null,
          },
        },
        { provide: CrashReporter, useValue: { report } },
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

  describe('who gets what on the editor address', () => {
    const refuseTheProject = (): void => {
      routes['GET /projects/7'] = () => json({ message: 'Forbidden' }, 403);
    };

    beforeEach(() => {
      routes['GET /moderation/projects/7/preview'] = () => json({ ...details, hasRelease: false });
      routes['GET /moderation/projects/7/preview/content'] = () =>
        new Response(savedGame('print(2)') as BlobPart, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        });
    });

    it('gives a collaborator the live session, in a mode that writes', async () => {
      const service = TestBed.inject(WorkSessionService);
      await service.open(7);

      expect(service.status()).toBe('ready');
      expect(service.preview()).toBeNull();
      expect(TestBed.inject(EditorModeService).canWrite()).toBe(true);
      expect(called('POST /work-sessions/join/7')).toHaveLength(1);
    });

    it('gives a staff member who collaborates on the game the live session too', async () => {
      staff = true;
      const service = TestBed.inject(WorkSessionService);
      await service.open(7);

      expect(service.preview()).toBeNull();
      expect(called('POST /work-sessions/join/7')).toHaveLength(1);
      expect(called('GET /moderation/projects/7/preview')).toHaveLength(0);
    });

    it('gives a staff member who does not the last save to look at, with reads alone', async () => {
      staff = true;
      refuseTheProject();
      const service = TestBed.inject(WorkSessionService);
      await service.open(7);

      expect(service.status()).toBe('ready');
      expect(service.preview()).toBe('staff');
      expect(TestBed.inject(EditorModeService).mode()).toBe('read-only');
      expect(service.game.entryFile?.text.toString()).toBe('print(2)');
      expect(calls.map((call) => call.key).sort()).toEqual([
        'GET /moderation/projects/7/preview',
        'GET /moderation/projects/7/preview/content',
        'GET /projects/7',
      ]);
    });

    it('gives a suspended account its own game to look at, through the ordinary reads', async () => {
      suspended = true;
      const service = TestBed.inject(WorkSessionService);
      await service.open(7);

      expect(service.status()).toBe('ready');
      expect(service.preview()).toBe('own');
      expect(TestBed.inject(EditorModeService).canWrite()).toBe(false);
      expect(service.game.entryFile?.text.toString()).toBe('print(1)');
      expect(calls.map((call) => call.key).sort()).toEqual([
        'GET /projects/7',
        'GET /projects/7/content',
      ]);
    });

    it('refuses anyone else, without joining or reading further', async () => {
      refuseTheProject();
      const service = TestBed.inject(WorkSessionService);
      await service.open(7);

      expect(service.status()).toBe('error');
      expect(service.error()).toBe('Forbidden');
      expect(calls.map((call) => call.key)).toEqual(['GET /projects/7']);
    });

    it('does not take a game that cannot be found for one a staff member may look at', async () => {
      staff = true;
      routes['GET /projects/7'] = () => json({ message: 'Not found' }, 404);
      const service = TestBed.inject(WorkSessionService);
      await service.open(7);

      expect(service.status()).toBe('error');
      expect(calls.map((call) => call.key)).toEqual(['GET /projects/7']);
    });
  });

  describe('a game looked at', () => {
    const writes = (): string[] =>
      calls.map((call) => call.key).filter((key) => !key.startsWith('GET '));

    beforeEach(() => {
      suspended = true;
    });

    it('never counts whoever looks as someone working on the game', async () => {
      const service = TestBed.inject(WorkSessionService);
      await service.open(7);

      expect(service.isCollaborator()).toBe(false);
      expect(service.playProjectId).toBeNull();
    });

    it('is seeded and migrated while it opens, and closed to edits once it is open', async () => {
      routes['GET /projects/7/content'] = () => new Response(null, { status: 200 });
      const service = TestBed.inject(WorkSessionService);
      await service.open(7);
      const before = Y.encodeStateAsUpdate(service.doc);

      expect(service.game.files).toHaveLength(1);
      expect(service.doc.getText('projectName').toString()).toBe(details.name);
      expect(service.game.addFile('helpers')).toBeNull();
      service.game.setPaletteColour(3, '#abcdef');
      service.game.sheets[0]?.setPixel(1, 1, 5);
      expect(Y.encodeStateAsUpdate(service.doc)).toEqual(before);
      expect(report).not.toHaveBeenCalled();
    });

    it('sends nothing for an edit, however long it sits, nor for a forced save', async () => {
      vi.useFakeTimers();
      try {
        const service = TestBed.inject(WorkSessionService);
        const saves = TestBed.inject(SessionSaveService);
        await service.open(7);
        calls.length = 0;

        service.game.setPaletteColour(3, '#abcdef');
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
      await service.open(7);
      calls.length = 0;

      service.onPageHide({ persisted: false } as PageTransitionEvent);
      await service.close();

      expect(writes()).toEqual([]);
      expect(calls).toHaveLength(0);
      expect(service.status()).toBe('closed');
    });

    it('reports a write that went round the gate, and still saves nothing', async () => {
      const service = TestBed.inject(WorkSessionService);
      const saves = TestBed.inject(SessionSaveService);
      await service.open(7);
      calls.length = 0;

      service.game.entryFile?.text.insert(0, '-- round the gate\n');

      expect(report).toHaveBeenCalledTimes(1);
      expect(report).toHaveBeenCalledWith('web', expect.any(Error));
      expect(saves.dirty()).toBe(false);
      expect(calls).toHaveLength(0);
    });
  });

  describe('a live session whose mode does not write', () => {
    it.each(['diff', 'read-only'] as const)('refuses an edit in %s', async (mode) => {
      const service = TestBed.inject(WorkSessionService);
      await service.open(7);
      const before = Y.encodeStateAsUpdate(service.doc);

      TestBed.inject(EditorModeService).choose(mode);
      service.game.setPaletteColour(3, '#abcdef');
      expect(service.game.transact(() => undefined)).toBe(false);

      expect(Y.encodeStateAsUpdate(service.doc)).toEqual(before);
    });

    it('still takes what a collaborator writes, and reports none of it', async () => {
      const service = TestBed.inject(WorkSessionService);
      await service.open(7);
      TestBed.inject(EditorModeService).choose('read-only');
      const peer = new Y.Doc();
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(service.doc));
      peer.getText('projectName').insert(0, 'The ');

      Y.applyUpdate(service.doc, Y.encodeStateAsUpdate(peer), 'a peer');

      expect(service.doc.getText('projectName').toString()).toBe('The Ferry');
      expect(report).not.toHaveBeenCalled();
    });

    it('writes again once the mode is given up, and reports nothing for a write it allows', async () => {
      const service = TestBed.inject(WorkSessionService);
      const mode = TestBed.inject(EditorModeService);
      await service.open(7);
      mode.choose('read-only');
      mode.choose('normal');

      service.game.setPaletteColour(3, '#abcdef');
      service.game.entryFile?.text.insert(0, '-- typed\n');

      expect(service.game.palette[3]).toBe('#abcdef');
      expect(report).not.toHaveBeenCalled();
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
    // Every leave is held and let go, not only the last asked for: a session an earlier test
    // left closing may send its own at any point while this one waits.
    const held: (() => void)[] = [];
    let released = false;
    routes['POST /work-sessions/leave/7'] = () =>
      new Promise<Response>((resolve) => {
        const answer = (): void => {
          resolve(json({}));
        };
        if (released) {
          answer();
        } else {
          held.push(answer);
        }
      });
    const service = TestBed.inject(WorkSessionService);
    const presence = TestBed.inject(SessionPresenceService);
    await service.open(7);
    expect(presence.awareness()).not.toBeNull();
    const closing = service.close();
    expect(presence.awareness()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    released = true;
    for (const answer of held) {
      answer();
    }
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
