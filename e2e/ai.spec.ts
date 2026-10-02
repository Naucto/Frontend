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
        // A chosen range narrows the change the way the Backend does, so a selection that the client
        // failed to send — or sent wrongly — shows up here rather than passing against a mock that
        // applied everything regardless.
        const hunks = (body.hunks ?? []) as { fileId: string; from: number; to: number }[];
        if (hunks.length) {
          const text = mainText(merged);
          if (!text) return json(route, { update: '', categories: [] });
          const whole = new Y.Doc();
          Y.applyUpdate(whole, Buffer.from(String(body.snapshot), 'base64'));
          this.commit(whole);
          const after = mainText(whole)?.toString() ?? '';
          const lines = after.split('\n');
          const chosen = hunks.flatMap((hunk) => lines.slice(hunk.from, hunk.to));
          text.delete(0, text.length);
          text.insert(0, [text.toString(), ...chosen].join('\n'));
          whole.destroy();
        } else if (!this.commit(merged))
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

/** A proposal of one code file, as the Backend stores it: the whole file before and after. */
function codeProposal(
  id: string,
  title: string,
  before: string,
  after: string,
): Record<string, unknown> {
  return {
    id,
    title,
    summary: title,
    contentHash: 'b'.repeat(64),
    status: 'PENDING',
    operations: [{ kind: 'code', fileId: 'main', before, after }],
    inverse: null,
  };
}

const replaceMain =
  (after: string) =>
  (doc: Y.Doc): boolean => {
    const text = mainText(doc);
    if (!text) return false;
    text.delete(0, text.length);
    text.insert(0, after);
    return true;
  };

test.describe('AI assistance', () => {
  test('a staged code change appears beside the editor, is accepted, and lands', async ({
    page,
  }) => {
    const ai = new AiBackend();
    const after = 'function _draw() gfx.cls(2) end';
    ai.commit = replaceMain(after);
    ai.proposals = [codeProposal('proposal', 'New background', 'old', after)];
    await openEditor(page, ai);

    // At the right of the editor by itself, with nobody having gone looking for it, and the file
    // being worked on still where it was.
    const pane = page.getByTestId('ai-review-pane');
    await expect(pane).toBeVisible();
    await expect(pane).toContainText(after);
    await expect(page.locator('nc-code-editor')).toBeVisible();
    // What goes is struck through in red and what replaces it is green.
    await expect(pane.locator('.cm-deletedChunk').first()).toBeVisible();
    await expect(pane.locator('.cm-changedLine').first()).toBeVisible();

    await page.getByRole('button', { name: 'Accept all' }).click();
    await expect.poll(() => ai.applies, { timeout: 10000 }).toBe(1);
    // The change landed in the document behind the editor that was already open.
    await expect(page.locator('nc-code-editor .cm-content')).toContainText(after);
    await expect(pane).toHaveCount(0);
  });

  test('a change that edits a file in two places can be taken one part at a time', async ({
    page,
  }) => {
    // A `code` operation carries the whole file, so accepting one accepted all of it. Somebody who
    // wanted one of the assistant's two edits had no way to say so.
    const ai = new AiBackend();
    const before = ['local a = 1', 'local m = 0', 'local n = 0', 'local b = 2'].join('\n');
    const expected = { first: 'local a = 9', second: 'local b = 8' };
    const after = [expected.first, 'local m = 0', 'local n = 0', expected.second].join('\n');
    ai.commit = replaceMain(after);
    ai.proposals = [codeProposal('proposal', 'Two edits', before, after)];
    await openEditor(page, ai);

    // Two separate edits, so there is something to choose between: leave the second one out.
    const pane = page.getByTestId('ai-review-pane');
    // (The gutter also holds a hidden spacer, block -1, that only reserves its width.)
    await expect(pane.locator('[data-block]:not([data-block="-1"])')).toHaveCount(2);
    await pane.locator('[data-block="1"]').click();
    // Only the chosen range is sent, so only that part is applied.
    await page.getByRole('button', { name: 'Accept chosen (1)' }).click();
    await expect.poll(() => ai.applies, { timeout: 10000 }).toBe(1);

    // The part taken is in the document; the part not taken is not.
    const applied = await page.locator('nc-code-editor .cm-content').innerText();
    expect(applied).toContain(expected.first);
    expect(applied).not.toContain(expected.second);
  });

  test('refusing a staged change removes it without touching the document', async ({ page }) => {
    const ai = new AiBackend();
    ai.proposals = [codeProposal('proposal', 'Unwanted', 'old', 'new')];
    await page.route('**/ai/projects/7/proposals/proposal/review', (route) => {
      ai.proposals[0].status = 'REJECTED';
      return route.fulfill({ contentType: 'application/json', body: '{"reviewed":true}' });
    });
    await openEditor(page, ai);
    await expect(page.locator('nc-code-editor .cm-content')).not.toBeEmpty();
    const before = await page.locator('nc-code-editor .cm-content').innerText();
    await page.getByRole('button', { name: 'Refuse' }).click();
    await expect(page.getByTestId('ai-review-pane')).toHaveCount(0);
    expect(ai.applies).toBe(0);
    expect(await page.locator('nc-code-editor .cm-content').innerText()).toBe(before);
  });

  test('accepting a change never interrupts the editor, with another tab open', async ({
    page,
    context,
  }) => {
    const ai = new AiBackend();
    const after = '-- accepted while both editors were open';
    ai.commit = replaceMain(after);
    ai.proposals = [codeProposal('proposal', 'Pending change', 'old', after)];
    const peer = await context.newPage();
    await openEditor(page, ai);
    await openEditor(peer, ai);
    await expect(page.getByTestId('ai-review-pane')).toBeVisible();
    // Mark the nodes that have to survive, "never interrupted" being a claim about them still being
    // the same ones rather than about which elements are on screen. The editor itself is the one
    // that matters: a teardown of the workspace leaves the shell and the rail in place and puts an
    // identical set of elements back, so probing only the chrome would pass while the editor
    // underneath was rebuilt.
    const PROBED = ['nc-editor-shell', 'nc-rail', 'nc-panel-region', 'nc-code-editor'];
    await page.evaluate((selectors) => {
      for (const selector of selectors)
        Object.assign(document.querySelector(selector) as object, { __probe: 'kept' });
    }, PROBED);
    await page.getByRole('button', { name: 'Accept all' }).click();
    await expect(page.locator('nc-code-editor .cm-content')).toContainText(after);
    await expect.poll(() => ai.applies, { timeout: 10000 }).toBe(1);

    // The same nodes, still carrying their mark: nothing was unmounted and rebuilt.
    const survived = await page.evaluate(
      (selectors) =>
        selectors.map(
          (selector) =>
            (document.querySelector(selector) as { __probe?: string }).__probe === 'kept',
        ),
      PROBED,
    );
    expect(survived).toEqual(PROBED.map(() => true));
    // The change reaches the other tab over the ordinary sync.
    await expect(peer.locator('nc-code-editor')).toHaveCount(1);
    await expect(peer.locator('nc-code-editor .cm-content')).toContainText(after);
    await peer.close();
  });

  test('a change the server refuses leaves the document exactly as it was', async ({ page }) => {
    const ai = new AiBackend();
    ai.commit = () => false;
    ai.proposals = [codeProposal('proposal', 'Pending change', 'old', 'new')];
    await openEditor(page, ai);
    // Read once the document has actually arrived, not once the editor component exists: the first
    // render can still be empty, and comparing an empty read against a loaded one is not a test of
    // anything.
    await expect(page.locator('nc-code-editor .cm-content')).not.toBeEmpty();
    const before = await page.locator('nc-code-editor .cm-content').innerText();
    await page.getByRole('button', { name: 'Accept all' }).click();
    // Said where the change was, and the change is still there to be looked at again.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('ai-review-pane')).toBeVisible();
    expect(ai.applies).toBe(0);
    // innerText to innerText: toHaveText would collapse the newlines and compare against a string
    // that has them. expect.poll retries, so a slow document load is not read as a changed document.
    await expect
      .poll(() => page.locator('nc-code-editor .cm-content').innerText(), { timeout: 10000 })
      .toBe(before);
  });

  test('each editor accepts its own changes, and shows nothing for the others', async ({
    page,
  }) => {
    const ai = new AiBackend();
    ai.proposals = [
      {
        id: 'sprite',
        title: 'New sprite',
        summary: 'Draws a sprite',
        contentHash: 'c'.repeat(64),
        status: 'PENDING',
        operations: [{ kind: 'pixels', sheetId: '0', x: 0, y: 0 }],
        inverse: null,
      },
    ];
    await mockEditor(page);
    await ai.attach(page);

    await page.goto('/edit/7/art');
    await expect(page.getByText('Assistant changes (1)')).toBeVisible();
    await expect(page.getByText('New sprite')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inspect changes' })).toBeVisible();

    // Code has nothing waiting: no pane, and no strip offering one.
    await page.goto('/edit/7/code');
    await expect(page.locator('nc-code-editor')).toBeVisible();
    await expect(page.getByTestId('ai-review-pane')).toHaveCount(0);
    await page.goto('/edit/7/map');
    await expect(page.getByText('Assistant changes')).toHaveCount(0);
  });

  test('a staged sound change shows in the sound editor, whatever is selected there', async ({
    page,
  }) => {
    const ai = new AiBackend();
    ai.proposals = [
      {
        id: 'music',
        title: 'New theme',
        summary: 'A looping theme',
        contentHash: 'd'.repeat(64),
        status: 'PENDING',
        operations: [{ kind: 'sound', category: 'MUSIC', slot: 0 }],
        inverse: null,
      },
    ];
    await mockEditor(page);
    await ai.attach(page);
    await page.goto('/edit/7/sound');
    await expect(page.getByText('Assistant changes (1)')).toBeVisible();
    await expect(page.getByText('New theme')).toBeVisible();
  });

  test('the game tab keeps only the AI provenance', async ({ page }) => {
    const ai = new AiBackend();
    await mockEditor(page);
    await ai.attach(page);
    await page.goto('/edit/7/game');
    await expect(page.locator('nc-ai-provenance')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Share this project' })).toHaveCount(0);
    await expect(page.locator('nc-assistant-section')).toHaveCount(0);
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
        // Short enough to default to an effect, long enough that there is something to transcribe.
        // The floor is around a second: below it the transcriber finds no notes at all, and the
        // import panel then never renders its target field — so a genuinely very short recording
        // cannot be imported this way, which is a limitation of the panel and not of this test.
        // Anything that needs to be a sample effect has to be at least this long.
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
