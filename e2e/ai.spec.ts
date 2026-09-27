import type { Page, Route } from '@playwright/test';
import * as Y from 'yjs';

import { mockEditor } from './editor-mocks';
import { expect, test } from './fixtures';

test.use({ viewport: { width: 1920, height: 1030 } });

interface Barrier {
  id: string;
  projectId: number;
  proposalId: string;
  status: string;
  expected: string[];
  result: string | null;
  violation: string | null;
  lateUpdates: string[];
}

/**
 * The AI endpoints of one project, kept in memory the way the Backend keeps them in its tables,
 * shared by every tab of a test so two editors see one barrier. It stands in for the real server:
 * the commit is simulated with Yjs here, and the Backend's own tests cover its validation.
 */
class AiBackend {
  editors = new Set<string>();
  snapshots = new Map<string, string>();
  barrier: Barrier | null = null;
  proposals: Record<string, unknown>[] = [];
  contexts: Record<string, unknown>[] = [];
  violations: { reason: string; update: string }[] = [];
  /** How `finish` transforms the merged snapshots; returns false to refuse. */
  commit: (doc: Y.Doc) => boolean = () => true;

  async attach(page: Page): Promise<void> {
    const json = (route: Route, body: unknown): Promise<void> =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    await page.route('**/ai/projects/7/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/^.*\/ai\/projects\/7\//, '');
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      if (path === 'editors/heartbeat') {
        this.editors.add(String(body.editorId));
        return json(route, this.barrier);
      }
      if (path === 'connection') return json(route, { token: 'naucto_ai_test', expiresAt: '' });
      if (path === 'context') {
        this.contexts.push(body.content as Record<string, unknown>);
        return json(route, { hash: 'a'.repeat(64) });
      }
      if (path === 'proposals') return json(route, this.proposals);
      if (path === 'jobs') return json(route, []);
      if (path === 'provenance')
        return json(route, { categories: [], declarations: [], applied: [] });
      const preview = /^proposals\/(.+)\/preview$/.exec(path);
      if (preview) {
        const doc = new Y.Doc();
        Y.applyUpdate(doc, Buffer.from(String(body.snapshot), 'base64'));
        this.commit(doc);
        const result = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
        doc.destroy();
        return json(route, { result });
      }
      const apply = /^proposals\/(.+)\/apply$/.exec(path);
      if (apply) {
        expect(new Set(body.participants as string[])).toEqual(this.editors);
        this.barrier = {
          id: 'barrier',
          projectId: 7,
          proposalId: apply[1] ?? '',
          status: 'PREPARING',
          expected: [...this.editors],
          result: null,
          violation: null,
          lateUpdates: [],
        };
        return json(route, this.barrier);
      }
      if (path === 'barriers/barrier/ack') {
        this.snapshots.set(String(body.editorId), String(body.snapshot));
        return json(route, { acknowledged: true });
      }
      if (path === 'barriers/barrier/violation') {
        this.violations.push({ reason: String(body.reason), update: String(body.update) });
        return json(route, this.barrier);
      }
      if (path === 'barriers/barrier/finish') {
        const barrier = this.barrier;
        if (!barrier) return route.fulfill({ status: 409, body: '{}' });
        if (barrier.status === 'APPLIED') return json(route, barrier);
        if (this.snapshots.size !== barrier.expected.length)
          return route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Waiting for all editors to pause' }),
          });
        const doc = new Y.Doc();
        for (const snapshot of this.snapshots.values())
          Y.applyUpdate(doc, Buffer.from(snapshot, 'base64'));
        this.commit(doc);
        barrier.result = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
        barrier.status = 'APPLIED';
        doc.destroy();
        for (const proposal of this.proposals)
          if (proposal.id === barrier.proposalId) proposal.status = 'APPLIED';
        return json(route, barrier);
      }
      return route.fulfill({ status: 404, body: '{}' });
    });
  }
}

/** Reports whose update the committed result does not already hold: real late writes. */
function unexplained(ai: AiBackend): { reason: string }[] {
  const result = ai.barrier?.result;
  return ai.violations.filter(({ update }) => {
    if (!result) return true;
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Buffer.from(result, 'base64'));
    const before = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
    Y.applyUpdate(doc, Buffer.from(update, 'base64'));
    const adds = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64') !== before;
    doc.destroy();
    return adds;
  });
}

const mainText = (doc: Y.Doc): Y.Text | undefined =>
  doc.getMap<Y.Map<Y.Text>>('code.files').get('main')?.get('text');

async function openEditor(page: Page, ai: AiBackend): Promise<void> {
  await mockEditor(page);
  await ai.attach(page);
  await page.goto('/edit/7/code');
  await expect(page.locator('nc-code-editor')).toBeVisible();
}

/** The assistant's settings, which live in the game's own configuration rather than a modal. */
async function openAssistant(page: Page): Promise<void> {
  await page.goto('/edit/7/game');
  await expect(page.locator('nc-assistant-section')).toBeVisible();
}

test.describe('AI assistance', () => {
  test('a code proposal is previewed from the server result, applied under the pause, and lands', async ({
    page,
  }) => {
    const ai = new AiBackend();
    const after = 'function _draw() gfx.cls(2) end';
    ai.commit = (doc) => {
      const text = mainText(doc);
      if (!text) return false;
      text.delete(0, text.length);
      text.insert(0, after);
      return true;
    };
    ai.proposals = [
      {
        id: 'proposal',
        title: 'New background',
        summary: 'Change the background',
        contentHash: 'b'.repeat(64),
        status: 'PENDING',
        operations: [{ kind: 'code' }],
        inverse: null,
      },
    ];
    await openEditor(page, ai);
    await openAssistant(page);
    await page.getByRole('button', { name: 'Connect / rotate token' }).click();
    await expect(page.getByText('naucto_ai_test', { exact: true })).toBeVisible();
    expect(ai.contexts).toHaveLength(1);
    // Applying is offered only after the preview.
    await expect(page.getByRole('button', { name: 'Accept change' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Inspect changes' }).click();
    await expect(page.getByTestId('ai-preview')).toContainText('Code: main');
    await expect(page.getByTestId('ai-preview')).toContainText(after);
    await page.getByRole('button', { name: 'Accept change' }).click();
    // The editor pauses, sends its state, and the accepting tab drives the commit itself.
    await expect.poll(() => ai.barrier?.status, { timeout: 10000 }).toBe('APPLIED');
    // Back on the page the person was already on; the panel that used to hold this is gone.
    await expect(page.locator('nc-assistant-section')).toBeVisible();
    await page.goto('/edit/7/code');
    await expect(page.locator('.cm-content')).toContainText(after);
    expect(ai.violations).toEqual([]);
  });

  test('two editors pause before acknowledging and take in the same committed update', async ({
    page,
    context,
  }) => {
    const ai = new AiBackend();
    ai.commit = (doc) => {
      const text = mainText(doc);
      if (!text) return false;
      text.delete(0, text.length);
      text.insert(0, '-- same approved result for both editors');
      return true;
    };
    const peer = await context.newPage();
    await openEditor(page, ai);
    await openEditor(peer, ai);
    await expect.poll(() => ai.editors.size).toBe(2);
    ai.barrier = {
      id: 'barrier',
      projectId: 7,
      proposalId: 'p',
      status: 'PREPARING',
      expected: [...ai.editors],
      result: null,
      violation: null,
      lateUpdates: [],
    };
    await expect.poll(() => ai.snapshots.size, { timeout: 10000 }).toBe(2);
    for (const editor of [page, peer])
      await expect(editor.locator('nc-code-editor')).toHaveCount(0);
    // The pause carries its own recovery now: the panel it used to point at is gone.
    await page.getByRole('button', { name: 'Apply now' }).click();
    for (const editor of [page, peer])
      await expect(editor.locator('.cm-content')).toContainText(
        '-- same approved result for both editors',
      );
    // Tabs relay the result to each other after it lands; the server discards what it already
    // holds, so nothing reported may add to it.
    expect(unexplained(ai)).toEqual([]);
    await peer.close();
  });

  test('an edit that reaches a paused editor is reported to the server', async ({ page }) => {
    const ai = new AiBackend();
    await openEditor(page, ai);
    ai.barrier = {
      id: 'barrier',
      projectId: 7,
      proposalId: 'p',
      status: 'PREPARING',
      expected: [...ai.editors],
      result: null,
      violation: null,
      lateUpdates: [],
    };
    await expect.poll(() => ai.snapshots.size, { timeout: 10000 }).toBe(1);
    // A peer's edit arriving over the network after this editor froze.
    await page.evaluate(() => {
      const shell = document.querySelector('nc-editor-shell');
      const { ng } = window as unknown as { ng: { getComponent(el: Element): unknown } };
      const view = ng.getComponent(shell!) as {
        session: {
          doc: {
            getMap(name: string): { set(k: string, v: number): void };
            transact(fn: () => void, origin: unknown): void;
          };
        };
      };
      view.session.doc.transact(
        () => {
          view.session.doc.getMap('gfx.sprites').set('1,1', 3);
        },
        { peer: true },
      );
    });
    await expect.poll(() => ai.violations.length).toBe(1);
    expect(ai.violations[0]?.reason).toBe('peer update after pause');
  });

  test('manual tile annotations keep their identity, lock regions, and create no proposal', async ({
    page,
  }) => {
    const ai = new AiBackend();
    await openEditor(page, ai);
    await openAssistant(page);
    await page.getByRole('radio', { name: 'Catalog & locks' }).click();
    await page.getByLabel('Asset name', { exact: true }).fill('Grass');
    await page.getByRole('button', { name: 'Register tile', exact: true }).click();
    await expect(page.getByText('Saved Grass.')).toBeVisible();
    await page.getByLabel('Asset name', { exact: true }).fill('Renamed grass');
    await page.getByRole('button', { name: 'Register tile', exact: true }).click();
    await expect(page.locator('[data-asset]')).toHaveCount(1);
    await expect(page.locator('[data-asset]')).toContainText('Renamed grass');
    await page.getByRole('button', { name: 'Lock region', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Unlock', exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'Changes' }).click();
    await page.getByRole('button', { name: 'Connect / rotate token' }).click();
    await expect.poll(() => ai.contexts.length).toBe(1);
    const shared = ai.contexts.at(-1) as {
      catalog: Record<string, { name: string; contentHash: string }>;
      locks: Record<string, unknown>;
    };
    const entries = Object.values(shared.catalog);
    expect(entries.map((entry) => entry.name)).toEqual(['Renamed grass']);
    expect(entries[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(shared.locks)).toHaveLength(1);
    expect(ai.proposals).toEqual([]);
  });
});

test.describe('MIDI import', () => {
  test('converts a chosen file into an editable song, with its report shown first', async ({
    page,
  }) => {
    const ai = new AiBackend();
    await mockEditor(page);
    await ai.attach(page);
    await page.goto('/edit/7/sound');
    await page.getByRole('button', { name: 'Import music or sound', exact: true }).click();
    // A quarter note at 120 BPM, then a four-note chord. With two voices the first note's release
    // tail still holds one when the chord starts, so only its top note fits.
    const track = [
      0, 0x90, 60, 100, 96, 0x80, 60, 0, 0, 0x90, 48, 90, 0, 0x90, 60, 70, 0, 0x90, 64, 80, 0, 0x90,
      72, 100, 96, 0x80, 48, 0, 0, 0x80, 60, 0, 0, 0x80, 64, 0, 0, 0x80, 72, 0, 0, 255, 47, 0,
    ];
    const file = Buffer.from([
      77,
      84,
      104,
      100,
      0,
      0,
      0,
      6,
      0,
      0,
      0,
      1,
      0,
      96,
      77,
      84,
      114,
      107,
      0,
      0,
      0,
      track.length,
      ...track,
    ]);
    await page
      .getByRole('dialog')
      .getByLabel('MIDI or audio file')
      .setInputFiles({ name: 'theme.mid', mimeType: 'audio/midi', buffer: file });
    await page.getByLabel('Voices').selectOption('2');
    await page.getByRole('button', { name: 'Convert', exact: true }).click();
    await expect(page.getByTestId('midi-report')).toContainText('2 of 5 notes imported');
    await expect(page.getByTestId('midi-report')).toContainText('3 dropped');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const song = await page.evaluate(() => {
      const shell = document.querySelector('nc-editor-shell');
      const { ng } = window as unknown as { ng: { getComponent(el: Element): unknown } };
      const view = ng.getComponent(shell!) as {
        session: { game: { getSongs(): Map<string, { sequence: string[] }> } };
      };
      return [...view.session.game.getSongs().values()].map((s) => s.sequence.length);
    });
    expect(song).toContain(1);
  });
});

/** A 16-bit mono WAV of harmonic tones: (MIDI pitch, start, length) in seconds. */
function wav(tones: [number, number, number][], seconds: number): Buffer {
  const rate = 22050;
  const samples = new Int16Array(Math.round(seconds * rate));
  for (const [pitch, start, length] of tones) {
    const f = 440 * Math.pow(2, (pitch - 69) / 12);
    const from = Math.round(start * rate),
      to = Math.min(samples.length, from + Math.round(length * rate));
    for (let i = from; i < to; i++) {
      const t = (i - from) / rate;
      const envelope = Math.min(1, t / 0.01) * Math.min(1, (to - i) / (0.02 * rate));
      let v = 0;
      for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
      samples[i] = Math.max(
        -32767,
        Math.min(32767, (samples[i] ?? 0) + Math.round(6000 * envelope * v)),
      );
    }
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples.byteLength, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples.byteLength, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer)]);
}

async function soundOf(page: Page): Promise<{ songs: number[]; sfx: string[]; samples: string[] }> {
  return page.evaluate(() => {
    const shell = document.querySelector('nc-editor-shell');
    const { ng } = window as unknown as { ng: { getComponent(el: Element): unknown } };
    const view = ng.getComponent(shell!) as {
      session: {
        game: {
          getSongs(): Map<string, { sequence: string[] }>;
          sfx: { keys(): Iterable<string> };
          samples: { keys(): Iterable<string> };
        };
      };
    };
    const game = view.session.game;
    return {
      songs: [...game.getSongs().values()].map((s) => s.sequence.length),
      sfx: [...game.sfx.keys()],
      samples: [...game.samples.keys()],
    };
  });
}

test.describe('audio import', () => {
  test.beforeEach(async ({ page }) => {
    await mockEditor(page);
    await new AiBackend().attach(page);
    await page.goto('/edit/7/sound');
    await page.getByRole('button', { name: 'Import music or sound', exact: true }).click();
  });

  test('a recording becomes an editable song, with its estimated loss shown first', async ({
    page,
  }) => {
    const melody: [number, number, number][] = [
      [60, 0.1, 0.4],
      [64, 0.6, 0.4],
      [67, 1.1, 0.4],
      [72, 1.6, 0.4],
      [67, 2.1, 0.4],
      [64, 2.6, 0.4],
    ];
    await page
      .getByRole('dialog')
      .getByLabel('MIDI or audio file')
      .setInputFiles({ name: 'tune.wav', mimeType: 'audio/wav', buffer: wav(melody, 3.2) });
    await expect(page.getByText('melody & harmony · 6 notes')).toBeVisible();
    await page.getByRole('button', { name: 'Convert', exact: true }).click();
    const loss = page.getByTestId('quality-loss');
    await expect(loss).toContainText('Estimated quality loss');
    const kept = Number(/\((\d+)% kept\)/.exec((await loss.textContent()) ?? '')?.[1]);
    expect(kept).toBeGreaterThan(60);
    await expect(page.getByRole('button', { name: 'Download MIDI' })).toBeVisible();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    expect((await soundOf(page)).songs).toContain(1);
  });

  test('a short sound can become a sample effect', async ({ page }) => {
    await page
      .getByRole('dialog')
      .getByLabel('MIDI or audio file')
      .setInputFiles({
        name: 'coin.wav',
        mimeType: 'audio/wav',
        buffer: wav(
          [
            [84, 0, 0.12],
            [91, 0.12, 0.2],
          ],
          0.4,
        ),
      });
    // Two seconds or less reads as an effect.
    await expect(page.getByLabel('Import as')).toHaveValue('sfx');
    await page.getByLabel('Import as').selectOption('sample');
    await page.getByRole('button', { name: 'Convert', exact: true }).click();
    await expect(page.getByTestId('midi-report')).toContainText('bytes of 8-bit sound');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const sound = await soundOf(page);
    expect(sound.samples).toHaveLength(1);
    expect(sound.sfx).toHaveLength(1);
  });
});
