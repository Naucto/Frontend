import type { Page } from '@playwright/test';

import { editorUrl, mockEditor } from '../editor-mocks';
import { expect, test } from '../fixtures';
import { boxOf } from './helpers';

test.use({ viewport: { width: 1920, height: 1030 } });

test.beforeEach(async ({ page }) => {
  await mockEditor(page);
});

/** The piano roll's keyboard column; every horizontal offset into the note grid clears it. */
const PIANO_KEY_GUTTER = 56;
/** A few steps in from the gutter — enough to land on a cell, not on its edge. */
const FIRST_NOTE_X = PIANO_KEY_GUTTER + 30;

/** The SOUND tab's + button, answered with a blank instrument. */
const addInstrument = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Add instrument' }).first().click();
  await page
    .getByRole('dialog', { name: 'New instrument' })
    .getByRole('button', { name: 'Custom' })
    .click();
};

test('the roll ends where the pattern ends', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  await addInstrument(page);
  const roll = page.getByRole('img', { name: 'Piano roll' });
  await expect(roll).toBeVisible();

  const steps = async (): Promise<string | null> =>
    page.getByRole('textbox', { name: 'Steps' }).inputValue();
  // The roll's own canvas is floored at the width of its window, so it does not shrink on a
  // wide screen. The track of voices under it is exactly as wide as the pattern, and has to
  // stay in step with it.
  const track = page.locator('nc-voices-lane').getByRole('img');
  const laneWidth = async (): Promise<number> =>
    await track.evaluate((el: HTMLElement) => el.offsetWidth);

  const long = await laneWidth();
  // The pattern is fresh, so nothing is past the new end and the field shortens without asking.
  await page.getByRole('button', { name: 'Steps -16' }).click();
  await expect.poll(steps).toBe('16');

  await expect.poll(laneWidth).toBeLessThan(long);
});

/** Three independent mechanisms, so none of these assertions stands in for another. */
test('the head can be dragged, rewound and resumed', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  await addInstrument(page);
  const roll = page.getByRole('img', { name: 'Piano roll' });
  await expect(roll).toBeVisible();
  const box = await boxOf(roll);

  // The ruler rides at the top of the *view*, so it sits at the canvas top plus however far the
  // roll has been scrolled — which is not zero: the roll opens on the middle of the keyboard.
  const rulerY =
    box.y +
    (await page.evaluate(() => {
      let el = document.querySelector('nc-piano-roll canvas')?.parentElement ?? null;
      while (el && el.scrollHeight <= el.clientHeight) {
        el = el.parentElement;
      }
      return (el?.scrollTop ?? 0) + 12;
    }));

  const head = async (): Promise<number | null> =>
    page.evaluate(() => {
      const line = document.querySelector('nc-piano-roll div.bg-hot.w-px');
      return line ? Math.round(line.getBoundingClientRect().left) : null;
    });

  await page.mouse.move(box.x + 200, rulerY);
  await page.mouse.down();
  await page.mouse.move(box.x + 320, rulerY, { steps: 8 });
  await page.mouse.up();
  const dragged = await head();
  expect(dragged).not.toBeNull();

  const rewind = page.getByRole('button', { name: 'Back to the start' });
  await rewind.click();
  await expect.poll(head).toBeLessThan(dragged ?? 0);

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(head).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await head();
  expect(paused).not.toBeNull();

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(600);
  expect(await head()).not.toBeNull();

  // Read with the head held still: rewound, the music keeps going, so a poll left to converge
  // follows it back out past where it started and says nothing about where the rewind put it.
  const running = await head();
  await rewind.click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(head).toBeLessThan(running ?? 0);
});

test('the sound column reaches its last row on a short screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto(editorUrl('sound'));
  const boxes = page.locator('nc-song-list [role=group] input');
  await expect(boxes).toHaveCount(20);
  // The two banks stand at a fixed height, so on a screen too short for both the column has to
  // be scrollable: a row of the music that cannot be reached is a row that cannot be written.
  const last = boxes.nth(19);
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
});

test('SOUND tab adds an instrument and paints notes', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  await addInstrument(page);
  const roll = page.getByRole('img', { name: 'Piano roll' });
  await expect(roll).toBeVisible();
  const box = await boxOf(roll);
  // Halfway down the roll: the ruler rides at the top of the view, and a press there moves
  // the playhead instead of writing a note.
  const x = box.x + FIRST_NOTE_X;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText('Not used yet — paint some notes.')).toHaveCount(0);

  // There is no last slot, so nothing counts what the bank holds: the slot itself is what says
  // it took the pattern.
  const slot = page.getByRole('button', { name: 'SFX slot 0' });
  await slot.click();
  await expect(slot).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'test-results/v-editor-sound.png' });
});

test('SOUND asks before removing an instrument that has notes, not an unused one', async ({
  page,
}) => {
  await page.goto(editorUrl('sound'));
  await addInstrument(page);
  // A blank instrument goes at once: undo has it.
  await page.getByRole('button', { name: 'Remove lead' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove lead' })).toHaveCount(0);

  await addInstrument(page);
  const roll = page.getByRole('img', { name: 'Piano roll' });
  const box = await boxOf(roll);
  await page.mouse.click(box.x + FIRST_NOTE_X, box.y + box.height / 2);
  await expect(page.getByText('Not used yet — paint some notes.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Remove lead' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Remove lead?');
  await expect(dialog).toContainText('1 pattern');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Remove lead' })).toBeVisible();

  await page.getByRole('button', { name: 'Remove lead' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('button', { name: 'Remove lead' })).toHaveCount(0);
});

test('Ctrl+Y redoes in SOUND and in MAP', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  await addInstrument(page);
  const roll = page.getByRole('img', { name: 'Piano roll' });
  const box = await boxOf(roll);
  // Past the history's capture window, so the note is a step of its own, not the instrument's.
  await page.waitForTimeout(400);
  await page.mouse.click(box.x + FIRST_NOTE_X, box.y + box.height / 2);
  const unused = page.getByText('Not used yet — paint some notes.');
  await expect(unused).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(unused).toBeVisible();
  await page.keyboard.press('Control+y');
  await expect(unused).toHaveCount(0);

  await page.locator('nc-rail').getByRole('button', { name: 'Map' }).click();
  const canvas = page.getByRole('img', { name: 'Map canvas' });
  const map = await boxOf(canvas);
  await page.mouse.click(map.x + 100, map.y + 100);
  const redo = page.getByRole('button', { name: 'Redo' });
  await expect(redo).toBeDisabled();
  await page.keyboard.press('Control+z');
  await expect(redo).toBeEnabled();
  await page.keyboard.press('Control+y');
  await expect(redo).toBeDisabled();
});

test('a held key glides across the keyboard', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  await addInstrument(page);
  const c4 = page.getByRole('button', { name: 'C4', exact: true });
  const d4 = page.getByRole('button', { name: 'D4', exact: true });
  const at = async (key: typeof c4): Promise<[number, number]> => {
    const box = await boxOf(key);
    return [box.x + 10, box.y + box.height / 2];
  };

  await page.mouse.move(...(await at(c4)));
  await page.mouse.down();
  await expect(c4).toHaveAttribute('aria-pressed', 'true');
  // The button stays down: the key changes under the pointer, and the sound with it.
  await page.mouse.move(...(await at(d4)), { steps: 4 });
  await expect(d4).toHaveAttribute('aria-pressed', 'true');
  await expect(c4).toHaveAttribute('aria-pressed', 'false');
  await page.mouse.up();
  await expect(d4).toHaveAttribute('aria-pressed', 'false');
});

test('an instrument is born from a preset, under its name', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  const born = async (): Promise<void> => {
    await page.getByRole('button', { name: 'Add instrument' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New instrument' });
    const tall = async (): Promise<number> => (await dialog.boundingBox())?.height ?? 0;
    const height = await tall();
    await dialog.getByRole('button', { name: 'From a preset' }).click();
    await expect(dialog.getByRole('radio')).toHaveCount(23);
    // One box, one height: the step and the shelf change what is in it and nothing else.
    expect(await tall()).toBe(height);
    const drums = dialog.getByRole('button', { name: 'Drums', exact: true });
    await drums.click();
    await expect(drums).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('radio')).toHaveCount(5);
    expect(await tall()).toBe(height);
    await dialog.getByRole('radio', { name: 'Noise hat' }).click();
    await expect(dialog.getByRole('radio', { name: 'Noise hat' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.screenshot({ path: 'test-results/v-editor-sound-presets.png' });
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toBeHidden();
  };

  await born();
  await expect(page.getByRole('radio', { name: 'Noise', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const rows = page.getByRole('list', { name: 'Instruments' }).getByRole('listitem');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Noise hat');

  // The same preset again is the same name, told apart by a number.
  await born();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText('Noise hat 2');
});
