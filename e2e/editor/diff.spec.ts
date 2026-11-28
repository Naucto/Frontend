import type { Page } from '@playwright/test';
import * as Y from 'yjs';

import { EditableGame } from '../../packages/engine/src/game/EditableGame';
import { FIRST_MAP_ID } from '../../packages/engine/src/game/keys';
import { editorUrl, mockEditor, PROJECT_ID, projectRoute } from '../editor-mocks';
import { expect, test } from '../fixtures';

test.use({ viewport: { width: 1920, height: 1030 } });

const MAIN_NOW = [
  'function _init()',
  '  x = 64',
  '  y = 90',
  '  speed = 2',
  'end',
  '',
  'function _update()',
  '  if input.down("left") then x = x - speed end',
  '  if input.down("right") then x = x + speed end',
  'end',
].join('\n');

const MAIN_THEN = [
  'function _init()',
  '  x = 64',
  '  y = 80',
  'end',
  '',
  'function _update()',
  '  if input.down("left") then x = x - 1 end',
  '  if input.down("right") then x = x + 1 end',
  'end',
  '-- jump next',
].join('\n');

/** A saved game whose `main` reads `main`, with an extra file and a tile on the first map. */
function savedGame(
  main: string,
  extra: { id: string; name: string; text: string },
  tile: number,
): Buffer {
  const doc = new Y.Doc();
  const game = new EditableGame(doc);
  game.seedDefaults();
  const file = game.files.find((held) => held.id === 'main');
  game.transact(() => {
    file?.text.delete(0, file.text.length);
    file?.text.insert(0, main);
  });
  game.addFile(extra.name, extra.text, extra.id);
  game.maps.find((map) => map.id === FIRST_MAP_ID)?.setTile(3, 3, tile);
  // A sprite drawn since the version: a pixel of sprite 1 the version does not have.
  if (tile) {
    game.sheets[0]?.setPixel(9, 1, 4);
  }
  return Buffer.from(Y.encodeStateAsUpdate(doc));
}

const NOW = savedGame(MAIN_NOW, { id: 'player', name: 'player', text: 'player = {}' }, 2);
const THEN = savedGame(MAIN_THEN, { id: 'enemy', name: 'enemy', text: 'enemy = {}\nhp = 3' }, 0);

test.beforeEach(async ({ page }) => {
  await mockEditor(page, {
    content: NOW,
    checkpoints: [{ name: 'first level', date: '2026-11-20T10:00:00.000Z' }],
  });
  await page.route(projectRoute('checkpoints/*'), (route) =>
    route.fulfill({ status: 200, body: THEN, contentType: 'application/octet-stream' }),
  );
});

/** Answers the assistant's working save with THEN as its draft, and keeps what a review sends. */
async function mockAssistant(page: Page): Promise<{ reviews: unknown[] }> {
  const reviews: unknown[] = [];
  await page.route(`**/ai/projects/${PROJECT_ID}/workspace`, (route) =>
    route.fulfill({
      json: {
        revision: 4,
        draft: THEN.toString('base64'),
        base: NOW.toString('base64'),
        updatedAt: '2026-11-27T10:00:00.000Z',
      },
    }),
  );
  await page.route(`**/ai/projects/${PROJECT_ID}/workspace/review`, (route) => {
    reviews.push(route.request().postDataJSON());
    return route.fulfill({
      status: 201,
      json: { revision: 5, draft: null, base: null, updatedAt: null },
    });
  });
  return { reviews };
}

test('compares the project with a saved version, read only', async ({ page }) => {
  await mockAssistant(page);
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Diff' }).click();
  await page.getByRole('button', { name: 'Compare from' }).click();
  await page.getByRole('button', { name: /first level/ }).click();
  await page.getByRole('button', { name: 'Compare to' }).click();
  await page.getByRole('button', { name: /Current project/ }).click();

  await expect(page.getByRole('status').filter({ hasText: '7 diffs' })).toBeVisible();
  // Five in CODE, the tile in MAP.
  await expect(page.getByRole('button', { name: '5 Code' })).toBeVisible();
  await expect(page.getByText('Read only')).toBeVisible();
  // The tab of a file the version did not have, and one of a file it had and the project lost.
  await expect(page.getByRole('tab', { name: 'player' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'enemy' })).toBeVisible();
  await expect(page.getByText('speed = 2').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept file' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/diff-compare.png' });
});

test('takes back part of a saved version, change by change', async ({ page }) => {
  await mockAssistant(page);
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Diff' }).click();
  await page.getByRole('button', { name: 'Compare to' }).click();
  await page.getByRole('button', { name: /first level/ }).click();

  await expect(page.getByText(/0 of \d+ reviewed/)).toBeVisible();
  // Take back the version's first change to main (`y = 80`, no `speed`) and refuse the rest.
  await page.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await expect(page.getByText('1 of 7 reviewed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await page.screenshot({ path: 'test-results/diff-review.png' });
  await page.getByRole('button', { name: 'Reject all' }).click();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply' }).click();

  await expect(page.getByRole('switch', { name: 'Diff' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('y = 80').first()).toBeVisible();
  await expect(page.getByText('speed = 2')).toHaveCount(0);
  await expect(page.getByText('x - speed').first()).toBeVisible();
  await expect(page.getByRole('tab', { name: 'enemy' })).toHaveCount(0);
});

test('reviews what the assistant made, and tells it what is left', async ({ page }) => {
  const { reviews } = await mockAssistant(page);
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Diff' }).click();

  await expect(page.getByRole('button', { name: 'Compare to' })).toContainText('AI changes');
  await expect(page.getByText('0 of 7 reviewed')).toBeVisible();
  await page.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await expect(page.getByText('1 of 7 reviewed')).toBeVisible();
  await page.getByRole('button', { name: 'Accept all' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply' }).click();

  await expect.poll(() => reviews.length).toBe(1);
  expect(reviews[0]).toMatchObject({
    revision: 4,
    categories: expect.arrayContaining(['CODE', 'MAPS']),
  });
  await expect(page.getByText('y = 80').first()).toBeVisible();
});

test('MAP marks the changed areas and takes one back', async ({ page }) => {
  await mockAssistant(page);
  await page.goto(editorUrl('map'));
  await page.getByRole('switch', { name: 'Diff' }).click();
  await page.getByRole('button', { name: 'Compare to' }).click();
  await page.getByRole('button', { name: /first level/ }).click();

  const changes = page.getByRole('list', { name: 'Changes' });
  await expect(changes.getByText('Area at 3, 3')).toBeVisible();
  await expect(page.getByRole('button', { name: '1 Map' })).toBeVisible();
  await changes.getByText('Area at 3, 3').click();
  await page.screenshot({ path: 'test-results/diff-map.png' });
  await changes.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.getByRole('button', { name: '1 Map' })).toHaveCount(0);
});

test('ART frames the sprites that changed and shows each before and after', async ({ page }) => {
  await mockAssistant(page);
  await page.goto(editorUrl('art'));
  await page.getByRole('switch', { name: 'Diff' }).click();
  await page.getByRole('button', { name: 'Compare to' }).click();
  await page.getByRole('button', { name: /first level/ }).click();

  const changes = page.getByRole('list', { name: 'Changes' });
  await expect(changes.getByText('Sprite 001')).toBeVisible();
  await page.getByRole('button', { name: 'Sprite 1' }).first().dispatchEvent('pointerdown');
  await expect(page.getByText('Before', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/diff-art.png' });
  await page.getByRole('button', { name: 'Accept', exact: true }).last().click();
  await expect(page.getByRole('button', { name: '1 Art' })).toHaveCount(0);
});
