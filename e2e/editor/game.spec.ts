import type { Locator, Page } from '@playwright/test';

import { editorUrl, mockEditor, projectRoute } from '../editor-mocks';
import { expect, test } from '../fixtures';

test.use({ viewport: { width: 1920, height: 1030 } });

/** The chip in the header, named for the game: the Inputs block has a preset of the same name. */
const versionsChip = (page: Page): Locator =>
  page.locator('nc-versions-popover').getByRole('button', { name: 'Platformer' });

test.beforeEach(async ({ page }) => {
  await mockEditor(page);
});

test('GAME tab binds the project meta', async ({ page }) => {
  await page.goto(editorUrl('game'));
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Platformer');
  await expect(page.getByText('Forked from')).toBeVisible();
  await page.screenshot({ path: 'test-results/v-editor-game.png' });
});

/**
 * The actions live in the document, not in the tab: leaving for CODE tears the page down, and the
 * preset is still applied on the way back. Asserted in one page load because the mock holds the
 * document in the page only.
 */
test('GAME tab lists the actions of the game, and a preset replaces them in the document', async ({
  page,
}) => {
  await page.goto(editorUrl('game'));
  const actions = page.getByRole('list', { name: 'Inputs' });
  await expect(actions.getByRole('listitem')).toHaveCount(9);
  await expect(actions.getByText('pause', { exact: true })).toBeVisible();

  await page
    .getByRole('group', { name: 'Start from' })
    .getByRole('button', { name: 'Platformer' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Replace the actions' }).click();
  await expect(actions.getByRole('listitem')).toHaveCount(7);
  await expect(actions.getByText('jump', { exact: true })).toBeVisible();

  await page.locator('nc-rail').getByRole('button', { name: 'Code' }).click();
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await page.locator('nc-rail').getByRole('button', { name: 'Game' }).click();
  await expect(
    page.getByRole('list', { name: 'Inputs' }).getByText('jump', { exact: true }),
  ).toBeVisible();
});

/**
 * The game is started before the preset is applied and never restarted: it reads the new actions
 * because the engine follows the document, not because it loaded them.
 */
test('a preset applied in the GAME tab is what the running game reads', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'naucto.seed.7',
      JSON.stringify({
        name: 'Tutorial',
        code: [
          'function _update()',
          '  if input.pressed("jump") then print("jumped") end',
          '  if input.pressed("a") then print("pressed a") end',
          'end',
        ].join('\n'),
      }),
    );
  });
  await page.goto(editorUrl('code'));
  await page.getByRole('tab', { name: 'main', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Play' }).first().click();
  // A key is read at the next step, so it is held for longer than one.
  const tapSpace = async (): Promise<void> => {
    await page.locator('nc-game-screen canvas').first().click();
    await page.keyboard.down('Space');
    await page.waitForTimeout(100);
    await page.keyboard.up('Space');
  };
  const said = (line: string): Locator => page.locator('nc-console-column').getByText(line);
  await tapSpace();
  await expect(said('pressed a')).toHaveCount(1);
  await expect(said('jumped')).toHaveCount(0);

  await page.locator('nc-rail').getByRole('button', { name: 'Game' }).click();
  await page
    .getByRole('group', { name: 'Start from' })
    .getByRole('button', { name: 'Platformer' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Replace the actions' }).click();
  await expect(page.getByRole('list', { name: 'Inputs' }).getByRole('listitem')).toHaveCount(7);

  await page.locator('nc-rail').getByRole('button', { name: 'Code' }).click();
  await tapSpace();
  await expect(said('jumped')).toHaveCount(1);
  await expect(said('pressed a')).toHaveCount(1);
});

test('a collaborator is shown with their picture, not their initial', async ({ page }) => {
  await page.goto(editorUrl('game'));
  await page.getByRole('button', { name: /share/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'priax' }).locator('img')).toBeVisible();
});

test('an autosave is deleted from the versions panel', async ({ page }) => {
  // Two of them, because the newest row is the one the game currently is and offers nothing to do
  // to itself. The beforeEach's mock answers with an empty list, so this route goes on top of it.
  let saves = [
    { name: 'save-2', date: '2026-09-11T09:00:00.000Z' },
    { name: 'save-1', date: '2026-09-11T08:00:00.000Z' },
  ];
  await page.route(projectRoute('versions'), (route) =>
    route.fulfill({ json: { versions: saves } }),
  );
  const deletes: string[] = [];
  await page.route(projectRoute('versions/*'), (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    deletes.push(name);
    saves = saves.filter((save) => save.name !== name);
    return route.fulfill({ json: { message: 'Version deleted successfully', name } });
  });

  await page.goto(editorUrl('game'));
  const chip = versionsChip(page);
  // The chip names the newest named version, and this project has none: an autosave coming or
  // going is not something it can show, so it reads the same before and after the delete.
  await expect(chip).toContainText('draft');
  await chip.click();
  const rows = page.locator('nc-popover-panel li', { hasText: 'Autosave' });
  await expect(rows).toHaveCount(2);

  await rows.nth(1).getByRole('button', { name: 'Delete this autosave' }).click();
  await expect(rows).toHaveCount(1);
  expect(deletes).toEqual(['save-1']);
  await expect(chip).toHaveText(/^\s*Platformer\s+draft\s*$/);
});

test('a pause in the typing is what saves the game', async ({ page }) => {
  let saves = 0;
  await mockEditor(page, {
    onSave: () => {
      saves += 1;
    },
  });

  await page.goto(editorUrl('game'));
  const name = page.getByRole('textbox', { name: 'Name' });
  await expect(name).toHaveValue('Platformer');
  // Opening a session as its host writes the document out once. Waited for rather than assumed,
  // so the count below is taken with that one already through.
  await expect(page.getByText('last saved')).toBeVisible();
  const opened = saves;
  await name.fill('Platformer II');
  await expect(page.getByText('unsaved changes')).toBeVisible();

  // Nothing else is done to the page: the pause is the whole trigger. The five-minute interval
  // could not have fired in the time this waits.
  await expect(page.getByText('last saved')).toBeVisible({ timeout: 15000 });
  expect(saves).toBe(opened + 1);
});

/**
 * The host's one job is the autosave. Publishing and naming a version are a click, and a click is
 * one write whoever makes it — so a collaborator in a room somebody else hosts has both buttons,
 * and naming a version writes the document out once, from that click and from nothing else.
 */
test('a collaborator who is not the host may publish and name a version', async ({ page }) => {
  let saves = 0;
  await mockEditor(page, {
    hostId: 4,
    onSave: () => {
      saves += 1;
    },
  });
  await page.route(projectRoute('checkpoints/*'), (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 201, json: { message: 'Checkpoint saved' } })
      : route.fallback(),
  );

  await page.goto(editorUrl('game'));
  const name = page.getByRole('textbox', { name: 'Name' });
  await expect(name).toHaveValue('Platformer');
  await expect(page.getByRole('button', { name: /^publish$/i })).toBeEnabled();
  // A guest opens without writing anything out, and an edit makes the state worth naming.
  expect(saves).toBe(0);
  await name.fill('Platformer II');
  await expect(page.getByText('unsaved changes')).toBeVisible();

  await versionsChip(page).click();
  await page.locator('nc-popover-panel').getByRole('button', { name: 'Save a version' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save a version' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('v1');
  const save = dialog.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText('Saved version "v1"')).toBeVisible();
  await expect(page.getByText('last saved')).toBeVisible();
  expect(saves).toBe(1);
});

/**
 * The cap is said before the save is refused, and the way through it is said with it: a name the
 * list already holds rewrites that version and does not count.
 */
test('the cap on named versions is explained before the save is refused', async ({ page }) => {
  await mockEditor(page, {
    maxCheckpoints: 1,
    checkpoints: [{ name: 'v1', date: '2026-09-11T09:00:00.000Z' }],
  });

  await page.goto(editorUrl('game'));
  await versionsChip(page).click();
  await page.locator('nc-popover-panel').getByRole('button', { name: 'Save a version' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save a version' });
  await expect(dialog.getByText('1 of 1 named versions')).toBeVisible();
  await expect(dialog.getByText('1 versions out of 1')).toBeVisible();
  const save = dialog.getByRole('button', { name: 'Save', exact: true });

  const name = dialog.getByRole('textbox', { name: 'Name' });
  await name.fill('v2');
  await expect(save).toBeDisabled();
  await name.fill('v1');
  await expect(dialog.getByText('Overwrites the version "v1"')).toBeVisible();
  await expect(save).toBeEnabled();
});
