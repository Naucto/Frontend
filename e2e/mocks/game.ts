import type { Page } from '@playwright/test';
import * as Y from 'yjs';

import { answer } from './session';

export const release = {
  id: 42,
  name: 'Cave Diver',
  shortDesc: 'Dive.',
  longDesc: null,
  tags: ['remixable'],
  iconUrl: null,
  status: 'COMPLETED',
  monetization: 'NONE',
  price: null,
  userId: 7,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  publishedAt: '2026-09-01T00:00:00.000Z',
  viewCount: 12,
  uniquePlayers: 3,
  likes: 1,
  collaborators: [],
  creator: { id: 7, username: 'ada' },
};

/** A release whose document holds one `main` file, served as the signed content of game 42. */
export const serveGame = async (
  page: Page,
  code: string,
  meta: Record<string, unknown> = {},
): Promise<void> => {
  const doc = new Y.Doc();
  doc.getMap('game.meta').set('schemaVersion', 1);
  for (const [key, value] of Object.entries(meta)) {
    doc.getMap('game.meta').set(key, value);
  }
  const main = new Y.Map<unknown>();
  const text = new Y.Text();
  doc.getMap('code.files').set('main', main);
  main.set('name', 'main');
  main.set('order', 0);
  main.set('text', text);
  text.insert(0, code);
  doc.getMap('code.meta').set('entry', 'main');
  const bytes = Buffer.from(Y.encodeStateAsUpdate(doc));

  await page.route('**/auth/refresh', answer(401, {}));
  await page.route('**/projects/releases/42', answer(200, release));
  await page.route('**/projects/releases/42/content-url', (route) =>
    route.fulfill({ json: { signedUrl: 'http://localhost:3001/e2e/game.bin' } }),
  );
  await page.route('**/e2e/game.bin', (route) =>
    route.fulfill({ status: 200, body: bytes, contentType: 'application/octet-stream' }),
  );
};
