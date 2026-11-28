import { writeMidi } from '../../packages/engine/src/sound/midi';
import { editorUrl, mockEditor } from '../editor-mocks';
import { expect, test } from '../fixtures';

test.use({ viewport: { width: 1920, height: 1030 } });

test.beforeEach(async ({ page }) => {
  await mockEditor(page);
});

/** Eight bars of a lead repeating one bar, over a bass holding two notes a bar, at 120 BPM. */
function tune(): Buffer {
  const note = (
    pitch: number,
    beat: number,
    beats = 1,
  ): {
    start: number;
    end: number;
    pitch: number;
    velocity: number;
    channel: number;
  } => ({ start: beat / 2, end: (beat + beats) / 2, pitch, velocity: 100, channel: 0 });
  return Buffer.from(
    writeMidi({
      tracks: [
        {
          index: 0,
          name: 'lead',
          notes: Array.from({ length: 32 }, (_, beat) => note(72 + (beat % 4), beat)),
          channels: [0],
          program: 80,
          percussion: false,
        },
        {
          index: 1,
          name: 'bass',
          notes: Array.from({ length: 8 }, (_, bar) => [
            note(36, bar * 4, 4),
            note(43, bar * 4, 4),
          ]).flat(),
          channels: [1],
          program: 33,
          percussion: false,
        },
      ],
      bpm: 120,
      tempoChanges: 0,
      sustained: 0,
      warnings: [],
      duration: 16,
    }),
  );
}

test('a MIDI file becomes a music with a track for each of its tracks', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  await page.getByRole('tab', { name: /^Timeline/ }).click();
  await page.getByRole('button', { name: 'Import MIDI' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a MIDI file' });
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'theme.mid',
    mimeType: 'audio/midi',
    buffer: tune(),
  });

  await expect(dialog.getByText('lead', { exact: true })).toBeVisible();
  await expect(dialog.getByText('bass', { exact: true })).toBeVisible();
  await expect(dialog.getByText('2 of 4')).toBeVisible();
  await page.screenshot({ path: 'test-results/midi-import.png' });
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-block]').first()).toBeVisible();
  await expect(page.getByText('lead').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/midi-timeline.png' });
});
