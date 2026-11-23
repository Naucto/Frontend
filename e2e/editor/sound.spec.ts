import type { Locator, Page } from '@playwright/test';

import { editorUrl, mockEditor } from '../editor-mocks';
import { expect, test } from '../fixtures';
import { boxOf } from './helpers';

test.use({ viewport: { width: 1920, height: 1030 } });

test.beforeEach(async ({ page }) => {
  await mockEditor(page);
});

const PIANO_KEY_GUTTER = 56;
const FIRST_NOTE_X = PIANO_KEY_GUTTER + 30;
const STEP_W = 24;

const addInstrument = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Add instrument' }).first().click();
  await page
    .getByRole('dialog', { name: 'New instrument' })
    .getByRole('button', { name: 'Custom' })
    .click();
};

const tab = (page: Page, name: string): Locator =>
  page.getByRole('tab', { name: new RegExp(`^${name}`) });

const rulerY = async (page: Page, roll: Locator): Promise<number> => {
  const box = await boxOf(roll);
  const scrolled = await page.evaluate(() => {
    let el = document.querySelector('nc-piano-roll canvas')?.parentElement ?? null;
    while (el && el.scrollHeight <= el.clientHeight) {
      el = el.parentElement;
    }
    return el?.scrollTop ?? 0;
  });
  return box.y + scrolled + 12;
};

const laneWidth = (page: Page): Promise<number> =>
  page
    .locator('nc-voices-lane')
    .getByRole('img')
    .evaluate((el: HTMLElement) => el.offsetWidth);

test('a note past the end lengthens the pattern to its bar, and taking it out shortens it back', async ({
  page,
}) => {
  await page.goto(editorUrl('sound'));
  await addInstrument(page);
  const roll = page.getByRole('img', { name: 'Piano roll' });
  await expect(roll).toBeVisible();
  const box = await boxOf(roll);
  const y = box.y + box.height / 2;
  const short = await laneWidth(page);

  const past = box.x + 20 * STEP_W + 5;
  await page.mouse.click(past, y);
  await expect.poll(() => laneWidth(page)).toBeGreaterThan(short);

  await page.mouse.click(past, y, { button: 'right' });
  await expect.poll(() => laneWidth(page)).toBe(short);
});

test('END drags the end of the pattern a beat at a time', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  await addInstrument(page);
  const roll = page.getByRole('img', { name: 'Piano roll' });
  const box = await boxOf(roll);
  const y = await rulerY(page, roll);
  const short = await laneWidth(page);

  await page.mouse.move(box.x + 16 * STEP_W, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 24 * STEP_W, y, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => laneWidth(page)).toBeGreaterThan(short);
});

test('the head can be dragged, played, paused and stopped', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  await addInstrument(page);
  const roll = page.getByRole('img', { name: 'Piano roll' });
  const box = await boxOf(roll);
  const y = await rulerY(page, roll);
  await expect(page.getByRole('button', { name: 'Back to the start' })).toHaveCount(0);

  const head = async (): Promise<number | null> =>
    page.evaluate(() => {
      const line = document.querySelector('nc-piano-roll div.bg-hot.w-px');
      return line ? Math.round(line.getBoundingClientRect().left) : null;
    });

  await page.mouse.move(box.x + 100, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, y, { steps: 6 });
  await page.mouse.up();
  expect(await head()).not.toBeNull();

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(await head()).not.toBeNull();

  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect.poll(head).toBeNull();
});

test('SOUND adds an instrument and paints notes in a pattern and in an SFX', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  await addInstrument(page);
  await expect(page.getByText('Empty pattern')).toBeVisible();
  const roll = page.getByRole('img', { name: 'Piano roll' });
  const box = await boxOf(roll);
  const x = box.x + FIRST_NOTE_X;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText('Empty pattern')).toHaveCount(0);

  await tab(page, 'SFX').click();
  await expect(page.getByText('Empty SFX')).toBeVisible();
  const sfxRoll = await boxOf(page.getByRole('img', { name: 'Piano roll' }));
  await page.mouse.click(sfxRoll.x + FIRST_NOTE_X, sfxRoll.y + sfxRoll.height / 2);
  await expect(page.getByText('Empty SFX')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/v-editor-sound.png' });
});

test('SOUND asks before removing an instrument that has notes, not an unused one', async ({
  page,
}) => {
  await page.goto(editorUrl('sound'));
  const remove = page.getByRole('button', { name: 'Remove lead' });
  const row = page.getByRole('list', { name: 'Instruments' }).getByRole('listitem').first();
  await addInstrument(page);
  await row.hover();
  await remove.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(remove).toHaveCount(0);

  await addInstrument(page);
  const roll = page.getByRole('img', { name: 'Piano roll' });
  const box = await boxOf(roll);
  await page.mouse.click(box.x + FIRST_NOTE_X, box.y + box.height / 2);
  await expect(page.getByText('Empty pattern')).toHaveCount(0);

  await row.hover();
  await remove.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Remove lead?');
  await expect(dialog).toContainText('1 pattern');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await row.hover();
  await expect(remove).toBeVisible();

  await remove.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(remove).toHaveCount(0);
  const toast = page.getByRole('button', { name: 'Undo', exact: true }).last();
  await toast.click();
  await expect(page.getByText('Empty pattern')).toHaveCount(0);
});

test('Ctrl+Y redoes in SOUND and in MAP', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  await addInstrument(page);
  const roll = page.getByRole('img', { name: 'Piano roll' });
  const box = await boxOf(roll);
  await page.waitForTimeout(400);
  await page.mouse.click(box.x + FIRST_NOTE_X, box.y + box.height / 2);
  const empty = page.getByText('Empty pattern');
  await expect(empty).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(empty).toBeVisible();
  await page.keyboard.press('Control+y');
  await expect(empty).toHaveCount(0);

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
  const at = async (key: Locator): Promise<[number, number]> => {
    const box = await boxOf(key);
    return [box.x + box.width - 6, box.y + box.height / 2];
  };

  await page.mouse.move(...(await at(c4)));
  await page.mouse.down();
  await expect(c4).toHaveAttribute('aria-pressed', 'true');
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
  const rows = page.getByRole('list', { name: 'Instruments' }).getByRole('listitem');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Noise hat');
  await tab(page, 'Instruments').click();
  await expect(page.getByRole('radio', { name: 'Noise', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await born();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText('Noise hat 2');
});

test('the pattern menu creates a pattern and renames the chosen one in place', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  await addInstrument(page);
  const roll = await boxOf(page.getByRole('img', { name: 'Piano roll' }));
  await page.mouse.click(roll.x + FIRST_NOTE_X, roll.y + roll.height / 2);
  const menu = page.getByRole('button', { name: 'Patterns', exact: true });
  await menu.click();
  await page.getByRole('button', { name: 'Pattern', exact: true }).click();
  await expect(menu).toContainText('01');

  await page.getByRole('menuitem').filter({ hasText: '01' }).click();
  const field = page.getByRole('textbox', { name: 'Name' });
  await field.fill('chorus');
  await field.press('Enter');
  await expect(page.getByRole('menuitem').filter({ hasText: 'chorus' })).toBeVisible();
});

test('a window popped out of its tabs goes back where it came from', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  await tab(page, 'SFX').hover();
  await page.getByRole('button', { name: 'Pop SFX out' }).click();
  await expect(tab(page, 'SFX')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Base view' })).toBeVisible();

  await page.getByRole('button', { name: 'Put SFX back' }).click();
  await expect(tab(page, 'SFX')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Base view' })).toHaveCount(0);
});

test('a pattern dragged from the list lands on the timeline as a block', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  await addInstrument(page);
  const roll = await boxOf(page.getByRole('img', { name: 'Piano roll' }));
  await page.mouse.click(roll.x + FIRST_NOTE_X, roll.y + roll.height / 2);

  await tab(page, 'Timeline').click();
  const row = page.getByRole('list', { name: 'Patterns' }).getByRole('listitem').first();
  const from = await boxOf(row);
  const lane = page.locator('[data-lane]');
  const to = await boxOf(lane);
  await page.mouse.move(from.x + 40, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 30, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();

  const blocks = page.locator('[data-block]');
  await expect(blocks).toHaveCount(1);
  await blocks.first().click();
  await page.keyboard.press('Delete');
  await expect(blocks).toHaveCount(0);
});

test('each editor lists its shortcuts behind its ?', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  await addInstrument(page);
  await page.getByRole('button', { name: 'Shortcuts' }).click();
  const help = page.getByRole('dialog', { name: 'Shortcuts' });
  await expect(help).toContainText('Drag END in the ruler');
  await page.screenshot({ path: 'test-results/v-editor-sound-help.png' });
  await page.keyboard.press('Escape');

  await tab(page, 'Timeline').click();
  await page.getByRole('button', { name: 'Shortcuts' }).click();
  await expect(page.getByRole('dialog', { name: 'Shortcuts' })).toContainText(
    'insert the chosen pattern at the playhead',
  );
});

test('row actions show on hover and keyboard focus, and not after a click', async ({ page }) => {
  await page.goto(editorUrl('sound'));
  await addInstrument(page);
  const row = page.getByRole('list', { name: 'Instruments' }).getByRole('listitem').first();
  const remove = page.getByRole('button', { name: 'Remove lead' });
  await row.click();
  await page.mouse.move(900, 900);
  await expect(remove).toBeHidden();
  await row.hover();
  await expect(remove).toBeVisible();
  await page.mouse.move(900, 900);
  await expect(remove).toBeHidden();

  await page.getByRole('button', { name: 'Add instrument' }).first().focus();
  await page.keyboard.press('Tab');
  await expect(row).toBeFocused();
  await expect(remove).toBeVisible();
  for (let k = 0; k < 3; k++) {
    await page.keyboard.press('Tab');
  }
  await expect(remove).toBeFocused();
});
