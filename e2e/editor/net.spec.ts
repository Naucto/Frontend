import type { Locator, Page } from '@playwright/test';
import * as Y from 'yjs';

import { uuidOf } from '../../packages/api-client/testing';
import { EditableGame } from '../../packages/engine/src/game/EditableGame';
import { editorUrl, mockEditor } from '../editor-mocks';
import { expect, test } from '../fixtures';
import { mockHostedRoom } from '../mocks/netplay';

test.use({ viewport: { width: 1440, height: 900 } });

/** A game that hosts once it runs and puts something under a declared path and outside them. */
const HOSTS = [
  'local asked = false',
  'function _init() print("ready to host") end',
  'function _update()',
  '  if not asked then',
  '    asked = true',
  '    net.host({ max_players = 4 }, function()',
  '      net.state.players = { score = 7 }',
  '      net.state.round = 3',
  '    end)',
  '  end',
  'end',
].join('\n');

/** A saved game whose players may be read and not written, and which hosts when it runs. */
function savedGame(): Buffer {
  const game = new EditableGame(new Y.Doc());
  game.seedDefaults();
  const main = game.files[0]?.text;
  main?.delete(0, main.length);
  main?.insert(0, HOSTS);
  game.setNetPermission('players', 1);

  return Buffer.from(Y.encodeStateAsUpdate(game.doc));
}

const row = (page: Page, path: string): Locator => page.locator(`tr:has(td[title="${path}"])`);

async function declare(page: Page, parent: string | null, key: string): Promise<void> {
  if (parent === null) {
    await page.getByRole('button', { name: 'Path', exact: true }).click();
  } else {
    await row(page, parent).getByRole('button', { name: 'Add child node' }).click();
  }
  await page.getByPlaceholder('key').fill(key);
  await page.getByPlaceholder('key').press('Enter');
}

test('declares paths before any session, gives one a rule, and lets it inherit again', async ({
  page,
}) => {
  await mockEditor(page, { content: savedGame() });
  await page.goto(editorUrl('net'));

  await declare(page, null, 'winner');
  await expect(row(page, 'winner')).toContainText('open by default');

  await declare(page, 'players', 'score');
  const score = row(page, 'players.score');
  await expect(score).toContainText('from players');
  const write = score.getByRole('checkbox', { name: 'Clients can write this path' });
  await expect(write).not.toBeChecked();

  await write.click();
  await expect(score.locator('td').nth(1)).toHaveText('own');
  await expect(write).toBeChecked();

  await score.getByRole('button', { name: 'Inherit again: drop this rule' }).click();
  await expect(score).toContainText('from players');
  await expect(write).not.toBeChecked();

  await row(page, 'winner')
    .getByRole('button', { name: /^Delete/ })
    .click();
  await expect(row(page, 'winner')).toHaveCount(0);
  await expect(score).toBeVisible();
});

test('adds what a running session holds beside the rules, and greys what it was not told of', async ({
  page,
}) => {
  await mockEditor(page, { content: savedGame() });
  await mockHostedRoom(page, '2f3c9a40-6b1e-4d7a-9c55-1e8b0d4f7a62', [
    { userId: uuidOf(1), username: 'alexis', nickname: 'alexis', host: true, playerId: 1 },
  ]);
  await page.goto(editorUrl('net'));
  await declare(page, 'players', 'score');
  await expect(page.getByRole('columnheader', { name: 'Value' })).toHaveCount(0);

  await page.locator('nc-rail').getByRole('button', { name: 'Code' }).click();
  await expect(page.getByText('ready to host').first()).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Start hosting' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await page.locator('nc-rail').getByRole('button', { name: 'Net' }).click();

  await expect(page.getByRole('columnheader', { name: 'Value' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Owner' })).toBeVisible();
  const score = row(page, 'players.score');
  await expect(score).toContainText('from players');
  await expect(score).toContainText('7');
  await expect(score).toContainText('host');
  const round = row(page, 'round');
  await expect(round).toContainText('3');
  await expect(round.locator('td').first()).toHaveClass(/text-ink-3/);
  await expect(round).toContainText('open by default');
  await expect(page.locator('nc-panel-column')).toContainText('hosting');
});
