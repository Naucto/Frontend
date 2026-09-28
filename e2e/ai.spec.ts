import type { Page, Route } from '@playwright/test';
import * as Y from 'yjs';

import { mockEditor } from './editor-mocks';
import { expect, test } from './fixtures';

test.use({ viewport: { width: 1920, height: 1030 } });

/**
 * The AI endpoints of one project, kept in memory the way the Backend keeps them in its tables,
 * shared by every tab of a test. It stands in for the real server:
 * the commit is simulated with Yjs here, and the Backend's own tests cover its validation.
 */
/** The text of main.lua in a document, which is what a code change writes. */
function mainText(doc: Y.Doc): Y.Text | null {
  const file = doc.getMap<Y.Map<Y.Text>>('code.files').get('main');
  const text = file?.get('text');
  return text instanceof Y.Text ? text : null;
}

class AiBackend {
  proposals: Record<string, unknown>[] = [];
  contexts: Record<string, unknown>[] = [];
  applies = 0;
  /** How an apply transforms the caller's own document; returns false to refuse. */
  commit: (doc: Y.Doc) => boolean = () => true;

  async attach(page: Page): Promise<void> {
    const json = (route: Route, body: unknown): Promise<void> =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    await page.route('**/ai/projects/7/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/^.*\/ai\/projects\/7\//, '');
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
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
        // The caller's own state is the base, and what comes back is that merged state: the server
        // never asks anyone to stop editing to find out what would change. A whole state, as in the
        // real Backend — a difference is only valid for the client whose state vector it was cut
        // against, and this update reaches every tab. Mocking a difference here would let a
        // state-versus-delta regression through this suite untouched.
        const held = new Y.Doc();
        Y.applyUpdate(held, Buffer.from(String(body.snapshot), 'base64'));
        const merged = new Y.Doc();
        Y.applyUpdate(merged, Y.encodeStateAsUpdate(held));
        if (!this.commit(merged))
          return route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'That change no longer applies to this project' }),
          });
        this.applies += 1;
        const update = Buffer.from(Y.encodeStateAsUpdate(merged)).toString('base64');
        held.destroy();
        merged.destroy();
        for (const proposal of this.proposals)
          if (proposal.id === (apply[1] ?? '')) proposal.status = 'APPLIED';
        return json(route, { update, categories: ['CODE'] });
      }
      return route.fulfill({ status: 404, body: '{}' });
    });
  }
}

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
  test('a code proposal is previewed from the server result, applied, and lands', async ({
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
    // Polled, not read once: the token appearing on screen does not mean the share it triggers has
    // reached the server yet, and a single read is a race rather than an assertion.
    await expect.poll(() => ai.contexts.length, { timeout: 10000 }).toBe(1);
    // Applying is offered only after the preview.
    await expect(page.getByRole('button', { name: 'Accept change' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Inspect changes' }).click();
    await expect(page.getByTestId('ai-preview')).toContainText('Code: main');
    await expect(page.getByTestId('ai-preview')).toContainText(after);
    await page.getByRole('button', { name: 'Accept change' }).click();
    await expect.poll(() => ai.applies, { timeout: 10000 }).toBe(1);
    // The change landed in the document behind the tab that was already open, and the editor
    // never left it: no pause, no unmount, nothing to close and reopen.
    await expect(page.locator('nc-assistant-section')).toBeVisible();
    await expect(page.getByText(/^Applied:/)).toBeVisible();
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    await expect(page.locator('.cm-content')).toContainText(after);
  });

  test('accepting a change never interrupts the editor, with another tab open', async ({
    page,
    context,
  }) => {
    const ai = new AiBackend();
    ai.commit = (doc) => {
      const text = mainText(doc);
      if (!text) return false;
      text.delete(0, text.length);
      text.insert(0, '-- accepted while both editors were open');
      return true;
    };
    ai.proposals = [
      {
        id: 'proposal',
        title: 'Pending change',
        summary: 'Something to accept',
        contentHash: 'b'.repeat(64),
        status: 'PENDING',
        operations: [{ kind: 'code' }],
        inverse: null,
      },
    ];
    const peer = await context.newPage();
    await openEditor(page, ai);
    await openEditor(peer, ai);
    await openAssistant(page);
    // Mark the nodes that have to survive, "never interrupted" being a claim about them still being
    // the same ones rather than about which elements are on screen. The routed tab is the one that
    // matters: a teardown of the workspace leaves the shell, the rail and the panel region in place
    // and puts an identical set of elements back, so probing only the chrome would pass while the
    // editor underneath was rebuilt. Typed text cannot be the probe either — a `code` change
    // replaces the whole file, so what was typed is meant to be gone.
    const PROBED = ['nc-editor-shell', 'nc-rail', 'nc-panel-region', 'nc-assistant-section'];
    await page.evaluate((selectors) => {
      for (const selector of selectors)
        Object.assign(document.querySelector(selector) as object, { __probe: 'kept' });
    }, PROBED);
    await page.getByRole('button', { name: 'Inspect changes' }).click();
    await page.getByRole('button', { name: 'Accept change' }).click();
    // Wait for the client to have acted on the reply, not for the server to have counted the
    // request: the mock increments before it responds, so polling `applies` reads the nodes while
    // the change is still in flight and the probe below would pass against a teardown that had not
    // happened yet. The receipt is the client saying it applied it.
    await expect(page.getByText(/^Applied:/)).toBeVisible();
    await expect.poll(() => ai.applies, { timeout: 10000 }).toBe(1);

    // The thing this replaced paused every editor and replaced the whole document: both tabs
    // lost their workspace and had to be driven by whoever asked for the change. The accepting tab
    // is simply still where it was, and the change reaches the other over the ordinary sync.
    await expect(page.locator('nc-assistant-section')).toBeVisible();
    // The same nodes, still carrying their mark: the workspace was never unmounted and rebuilt.
    const survived = await page.evaluate(
      (selectors) =>
        selectors.map(
          (selector) =>
            (document.querySelector(selector) as { __probe?: string }).__probe === 'kept',
        ),
      PROBED,
    );
    expect(survived).toEqual(PROBED.map(() => true));
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    await expect(page.locator('.cm-content')).toContainText(
      '-- accepted while both editors were open',
    );
    await expect(peer.locator('nc-code-editor')).toHaveCount(1);
    await expect(peer.locator('.cm-content')).toContainText(
      '-- accepted while both editors were open',
    );
    await peer.close();
  });

  test('a change the server refuses leaves the document exactly as it was', async ({ page }) => {
    const ai = new AiBackend();
    ai.commit = () => false;
    ai.proposals = [
      {
        id: 'proposal',
        title: 'Pending change',
        summary: 'Something to accept',
        contentHash: 'b'.repeat(64),
        status: 'PENDING',
        operations: [{ kind: 'code' }],
        inverse: null,
      },
    ];
    await openEditor(page, ai);
    // Read once the document has actually arrived, not once the editor component exists: the first
    // render can still be empty, and comparing an empty read against a loaded one is not a test of
    // anything.
    await expect(page.locator('.cm-content')).not.toBeEmpty();
    const before = await page.locator('.cm-content').innerText();
    await openAssistant(page);
    await page.getByRole('button', { name: 'Inspect changes' }).click();
    await page.getByRole('button', { name: 'Accept change' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(ai.applies).toBe(0);
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    // innerText to innerText: toHaveText would collapse the newlines and compare against a string
    // that has them. expect.poll retries, so a slow document load is not read as a changed document.
    await expect
      .poll(() => page.locator('.cm-content').innerText(), { timeout: 10000 })
      .toBe(before);
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
        // Short enough to default to an effect, long enough that there is something to transcribe:
        // a fraction of a second of two tones was below what the transcriber can find notes in.
        buffer: wav(
          [
            [84, 0, 0.3],
            [91, 0.35, 0.3],
            [88, 0.7, 0.3],
            [84, 1.1, 0.5],
          ],
          1.8,
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
