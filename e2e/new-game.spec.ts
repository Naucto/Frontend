import { expect, test } from './fixtures';
import { mockSignedIn } from './mocks/session';

test('a game made from a cold load is named in words, not by a catalogue key', async ({ page }) => {
  await mockSignedIn(page);
  // Held back, so the page is up before the catalogue is.
  await page.route('**/i18n/en.json*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  const names: unknown[] = [];
  await page.route('**/projects', (route) => {
    names.push((route.request().postDataJSON() as { name: unknown }).name);
    return route.fulfill({ status: 201, json: { id: 9 } });
  });

  await page.goto('/games/new');

  await expect.poll(() => names).toEqual(['Untitled game']);
});
