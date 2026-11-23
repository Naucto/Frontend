import type { Page } from '@playwright/test';
import * as Y from 'yjs';

import { EditableGame } from '../../packages/engine/src/game/EditableGame';
import { defaultInstrument } from '../../packages/engine/src/sound/model';
import { editorUrl, mockEditor, PROJECT_ID } from '../editor-mocks';
import { expect, test } from '../fixtures';
import { boxOf, drag } from './helpers';

test.use({ viewport: { width: 1920, height: 1030 } });

/** A saved game with something in every tab: the starter, a net rule and an instrument. */
function savedGame(): Buffer {
  const game = new EditableGame(new Y.Doc());
  game.seedDefaults();
  game.setNetPermission('players.score', 3);
  game.setInstrument(defaultInstrument('lead'));
  game.doc.getText('projectName').insert(0, 'Platformer');

  return Buffer.from(Y.encodeStateAsUpdate(game.doc));
}

/** The game document the editor holds, byte for byte, as its session would save it. */
async function documentBytes(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const shell = document.querySelector('nc-editor-shell');
    const { ng } = window as unknown as { ng: { getComponent(el: Element | null): unknown } };
    const view = ng.getComponent(shell) as { session: { snapshot(): Blob } };
    const bytes = new Uint8Array(await view.session.snapshot().arrayBuffer());

    return Array.from(bytes).join(',');
  });
}

const rail = (page: Page, tab: string): Promise<void> =>
  page.locator('nc-rail').getByRole('button', { name: tab }).click();

test.describe('a staff member who does not collaborate on the game', () => {
  let writes: string[];
  let stored: Awaited<ReturnType<typeof mockEditor>>;

  test.beforeEach(async ({ page }) => {
    writes = [];
    stored = await mockEditor(page, {
      staff: true,
      content: savedGame(),
      onWrite: (request) => writes.push(request),
    });
  });

  test('opens it on the editor address, to look at, and is told why', async ({ page }) => {
    await page.goto(`/edit/${String(PROJECT_ID)}`);

    await expect(page).toHaveURL(new RegExp(`/edit/${String(PROJECT_ID)}/game$`));
    await expect(page.getByTestId('read-only-band')).toContainText('Staff view of the latest save');
    // The header of a session nobody joined offers nothing to share, publish or go back to.
    await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);
    await expect(page.locator('nc-versions-popover')).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  for (const [state, words] of [
    [{ publishedAt: null, hiddenAt: null }, 'Not published'],
    [{ publishedAt: '2026-10-01T10:00:00.000Z', hiddenAt: null }, 'Published'],
    [
      { publishedAt: '2026-10-01T10:00:00.000Z', hiddenAt: '2026-11-02T10:00:00.000Z' },
      'Hidden by moderation',
    ],
  ] as const) {
    test(`is told on the band that the game is ${words.toLowerCase()}, and who made it`, async ({
      page,
    }) => {
      Object.assign(stored, state);
      await page.goto(editorUrl('game'));

      const band = page.getByTestId('read-only-band');
      await expect(band.getByTestId('read-only-state')).toHaveText(words);
      await expect(band.getByRole('img', { name: 'alexis' })).toBeVisible();
      // One band says it all: the one a game's own author gets about a withheld game is not theirs.
      await expect(page.getByText('A moderator hid this game')).toHaveCount(0);
      await band.getByRole('link', { name: 'by alexis' }).click();
      await expect(page).toHaveURL(/\/u\/alexis$/);
      expect(writes).toEqual([]);
    });
  }

  test('reads the code, finds in it and runs it, and types nothing into it', async ({ page }) => {
    await page.goto(editorUrl('code'));
    const code = page.locator('.cm-content');
    await expect(code).toContainText('Naucto starter game');
    const before = await documentBytes(page);

    await code.click();
    await page.keyboard.type('print("typed")');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Control+z');
    await expect(code).not.toContainText('typed');

    // A file is chosen but not added, renamed or removed.
    const tab = page.getByRole('tab', { name: 'main', exact: true });
    await expect(page.getByRole('button', { name: 'New file' })).toBeDisabled();
    await tab.hover();
    await expect(tab.getByRole('button')).toHaveCount(0);
    await tab.dblclick();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Finding is looking; replacing is not.
    await page.getByRole('button', { name: 'Find', exact: true }).click();
    const find = page.getByRole('textbox', { name: 'Find' });
    await find.fill('player');
    await page.getByRole('button', { name: 'Next match' }).click();
    await expect(page.locator('.cm-searchMatch-selected')).toHaveText('player');
    await expect(page.getByRole('button', { name: 'Replace', exact: true })).toBeDisabled();

    await page.getByRole('button', { name: 'Play' }).first().click();
    await expect(page.getByRole('button', { name: 'Pause' }).first()).toBeVisible();

    expect(await documentBytes(page)).toBe(before);
    expect(writes).toEqual([]);
  });

  test('looks at the sheet, zooms and picks, and paints nothing on it', async ({ page }) => {
    await page.goto(editorUrl('art'));
    const canvas = page.getByRole('img', { name: 'Sprite canvas' });
    await expect(canvas).toBeVisible();
    const before = await documentBytes(page);

    // The pen it would have opened on gives way to the tool that looks.
    await expect(page.getByRole('radio', { name: 'Pen' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'Fill' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'Pick' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Select' })).toBeEnabled();

    const box = await boxOf(canvas);
    await drag(page, box, { x: 200, y: 200 }, { x: 320, y: 260 }, { steps: 8 });
    await drag(page, box, { x: 200, y: 200 }, { x: 320, y: 260 }, { button: 'right' });
    // The pen's own key, which a sheet that may be written answers.
    await canvas.click({ position: { x: 240, y: 240 } });
    await page.keyboard.press('p');
    await expect(page.getByRole('radio', { name: 'Pick' })).toBeChecked();
    await page.keyboard.press('Control+v');
    await page.keyboard.press('Delete');

    // The moon's yellow, picked off the sheet by the tool that is left.
    await canvas.click({ position: { x: 100, y: 30 } });

    await expect(page.getByRole('group', { name: 'Flags' }).getByRole('checkbox')).toHaveCount(8);
    for (const flag of await page
      .getByRole('group', { name: 'Flags' })
      .getByRole('checkbox')
      .all()) {
      await expect(flag).toBeDisabled();
    }
    await expect(page.getByRole('textbox', { name: 'Hex colour' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Add a sheet' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Paste' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Copy' })).toBeEnabled();

    // Its own view of the sheet stays the reader's to set.
    const zoom = page.getByRole('button', { name: 'Fit the sheet to the panel' });
    const zoomBefore = await zoom.textContent();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(zoom).not.toHaveText(zoomBefore ?? '');
    const grid = page.getByRole('switch', { name: 'Grid' });
    await grid.click();
    await expect(grid).toHaveAttribute('aria-checked', 'false');

    expect(await documentBytes(page)).toBe(before);
    expect(writes).toEqual([]);
  });

  test('looks at the map and zooms it, and lays no tile on it', async ({ page }) => {
    await page.goto(editorUrl('map'));
    const canvas = page.getByRole('img', { name: 'Map canvas' });
    await expect(canvas).toBeVisible();
    const before = await documentBytes(page);

    await expect(page.getByRole('radio', { name: 'Stamp' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'Erase' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'Select' })).toBeChecked();

    const box = await boxOf(canvas);
    await drag(page, box, { x: 60, y: 60 }, { x: 120, y: 100 });
    await page.keyboard.press('s');
    await expect(page.getByRole('radio', { name: 'Select' })).toBeChecked();
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+v');
    // What the drag left is a selection, and the tile under it is still the empty one.
    await page.mouse.move(box.x + 90, box.y + 80);
    await expect(page.getByText(/^SPR 000$/)).toBeVisible();

    await expect(page.getByRole('button', { name: 'Add a map' })).toBeDisabled();
    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    await expect(zoomIn).toBeEnabled();
    await zoomIn.click();

    expect(await documentBytes(page)).toBe(before);
    expect(writes).toEqual([]);
  });

  test('hears the sounds and places no note', async ({ page }) => {
    await page.goto(editorUrl('sound'));
    const roll = page.getByRole('img', { name: 'Piano roll' });
    await expect(roll).toBeVisible();
    const before = await documentBytes(page);

    const box = await boxOf(roll);
    await page.mouse.click(box.x + 200, box.y + 200);
    await drag(page, box, { x: 240, y: 240 }, { x: 320, y: 240 });

    await expect(page.getByRole('button', { name: 'Add instrument' }).first()).toBeDisabled();
    await expect(page.getByRole('textbox', { name: 'BPM' })).toBeDisabled();
    await expect(page.getByRole('slider', { name: 'VOL' })).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'Sine' })).toBeDisabled();
    // Which pattern is shown, and whether it plays, are not edits.
    await expect(page.getByRole('textbox', { name: 'Pattern' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();

    expect(await documentBytes(page)).toBe(before);
    expect(writes).toEqual([]);
  });

  test('reads the net rules and switches none', async ({ page }) => {
    await page.goto(editorUrl('net'));
    const row = page.getByRole('row').filter({ hasText: 'score' });
    await expect(row).toBeVisible();
    const before = await documentBytes(page);

    const read = row.getByRole('button', { name: 'R', exact: true });
    await expect(read).toBeDisabled();
    await expect(read).toHaveAttribute('aria-pressed', 'true');
    await read.click({ force: true });
    await expect(read).toHaveAttribute('aria-pressed', 'true');
    for (const action of await row.locator('td').last().getByRole('button').all()) {
      await expect(action).toBeDisabled();
    }
    // Filtering and folding the tree change nothing but the view.
    await expect(page.getByRole('searchbox', { name: 'Filter' })).toBeEnabled();
    await page.getByRole('button', { name: 'Collapse all' }).click();
    await expect(row).toHaveCount(0);

    expect(await documentBytes(page)).toBe(before);
    expect(writes).toEqual([]);
  });

  test('reads the GAME tab as its author has it, every field closed, and runs the game', async ({
    page,
  }) => {
    await page.goto(editorUrl('game'));
    const name = page.getByRole('textbox', { name: 'Name' });
    await expect(name).toHaveValue('Platformer');
    const before = await documentBytes(page);

    await expect(name).toBeDisabled();
    await expect(page.getByRole('textbox', { name: 'Summary' })).toBeDisabled();
    await expect(page.getByRole('textbox', { name: 'Description' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Grab frame' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Record' })).toBeDisabled();
    const sidebar = page.locator('nc-game-publishing');
    await expect(sidebar.getByRole('button', { name: 'Export' })).toBeDisabled();
    for (const status of await sidebar
      .getByRole('radiogroup', { name: 'Status' })
      .getByRole('radio')
      .all()) {
      await expect(status).toBeDisabled();
    }

    // The three views are still walked through.
    const tabs = page.getByRole('tablist', { name: 'Game' });
    await tabs.getByRole('tab', { name: 'Disk' }).click();
    for (const finish of await page
      .getByRole('group', { name: 'Finish' })
      .getByRole('button')
      .all()) {
      await expect(finish).toBeDisabled();
    }

    await tabs.getByRole('tab', { name: 'Inputs' }).click();
    await expect(page.getByRole('button', { name: 'Add action' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Presets' })).toBeDisabled();
    const row = page.locator('tr[data-action]').first();
    await row.getByRole('button').first().click();
    await expect(page.getByRole('button', { name: 'Plug an input' })).toBeDisabled();
    await row.getByRole('button').first().press('Alt+ArrowDown');
    await expect(page.locator('tr[data-action] small').first()).toHaveText('left');
    // The pad a phone gets is only ever looked at.
    await page.getByRole('button', { name: 'Touch pad' }).click();
    await expect(page.getByRole('region', { name: 'Touch pad' })).toBeVisible();

    await sidebar.getByRole('button', { name: 'Play' }).first().click();
    await expect(sidebar.getByRole('button', { name: 'Pause' })).toBeVisible();

    expect(await documentBytes(page)).toBe(before);
    expect(writes).toEqual([]);
  });

  for (const address of ['staff/edit', 'staff/play']) {
    test(`is taken from the old /${address} address to the editor`, async ({ page }) => {
      await page.goto(`/${address}/${String(PROJECT_ID)}`);

      await expect(page).toHaveURL(new RegExp(`/edit/${String(PROJECT_ID)}/game$`));
      await expect(page.getByTestId('read-only-band')).toBeVisible();
    });
  }
});

test('a suspended account opens its own game the same way, and is told why', async ({ page }) => {
  const writes: string[] = [];
  await mockEditor(page, { content: savedGame() });
  await page.route(/\/(projects|work-sessions)\//, (route) => {
    if (route.request().method() !== 'GET') {
      writes.push(route.request().url());
    }
    return route.fallback();
  });
  await page.route('**/users/profile', (route) =>
    route.fulfill({
      json: {
        id: 1,
        email: 'a@x',
        username: 'alexis',
        nickname: 'alexis',
        role: 'User',
        createdAt: '',
        updatedAt: '',
        message: '',
        suspension: { since: '2026-11-01T00:00:00.000Z', until: null },
      },
    }),
  );
  await page.goto(editorUrl('game'));

  await expect(page.getByTestId('read-only-band')).toContainText(
    'Nothing in it can be changed while your account is suspended',
  );
  await expect(page.getByRole('textbox', { name: 'Name' })).toBeDisabled();
  const sidebar = page.locator('nc-game-publishing');
  await expect(sidebar.getByRole('button', { name: 'Delete' })).toBeDisabled();
  await expect(sidebar.getByRole('searchbox')).toBeDisabled();
  await sidebar.getByRole('button', { name: 'Play' }).first().click();
  await expect(sidebar.getByRole('button', { name: 'Pause' })).toBeVisible();
  expect(writes).toEqual([]);
});

test('a collaborator still edits the game: types, paints and is not told otherwise', async ({
  page,
}) => {
  await mockEditor(page);
  await page.goto(editorUrl('code'));
  const code = page.locator('.cm-content');
  await expect(code).toContainText('Naucto starter game');
  await expect(page.getByTestId('read-only-band')).toHaveCount(0);
  const before = await documentBytes(page);

  await code.click();
  await page.keyboard.type('-- typed ');
  await expect(code).toContainText('-- typed');
  await expect(page.getByRole('button', { name: 'New file' })).toBeEnabled();

  await rail(page, 'Art');
  const canvas = page.getByRole('img', { name: 'Sprite canvas' });
  await expect(page.getByRole('radio', { name: 'Pen' })).toBeChecked();
  const box = await boxOf(canvas);
  await drag(page, box, { x: 200, y: 200 }, { x: 320, y: 260 }, { steps: 8 });

  await rail(page, 'Game');
  const name = page.getByRole('textbox', { name: 'Name' });
  await expect(name).toBeEnabled();
  await name.fill('Renamed');

  await expect.poll(() => documentBytes(page)).not.toBe(before);
});
