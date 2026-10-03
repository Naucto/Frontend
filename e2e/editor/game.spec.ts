import { editorUrl, mockEditor, projectRoute } from '../editor-mocks';
import { expect, test } from '../fixtures';

test.use({ viewport: { width: 1920, height: 1030 } });

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
 * The names live in the document, not in the tab: leaving for CODE tears the page down, and the
 * word is still there on the way back. Asserted in one page load because the mock holds the
 * document in the page only.
 */
test('GAME tab names the controls, and the document keeps the name across tabs', async ({
  page,
}) => {
  await page.goto(editorUrl('game'));
  const jump = page.getByRole('textbox', { name: 'a', exact: true });
  await expect(jump).toHaveValue('');
  await jump.fill('Jump');
  await jump.press('Enter');
  await page.locator('nc-rail').getByRole('button', { name: 'Code' }).click();
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await page.locator('nc-rail').getByRole('button', { name: 'Game' }).click();
  await expect(page.getByRole('textbox', { name: 'a', exact: true })).toHaveValue('Jump');
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
  const chip = page.getByRole('button', { name: 'Platformer' });
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

  await page.getByRole('button', { name: 'Platformer' }).click();
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
  await page.getByRole('button', { name: 'Platformer' }).click();
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
