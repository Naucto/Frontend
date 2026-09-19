import { expect, type Page, test } from './fixtures';

const game = (id: number, name: string, tags: string[]): Record<string, unknown> => ({
  id,
  name,
  shortDesc: '',
  longDesc: '',
  tags,
  iconUrl: null,
  status: 'PUBLISHED',
  monetization: 'NONE',
  price: null,
  userId: 1,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  publishedAt: '2026-09-01T00:00:00.000Z',
  viewCount: 100 - id,
  uniquePlayers: 0,
  activePlayers: 0,
  likes: 0,
  forkCount: 0,
  forkedFromId: null,
  collaborators: [{ id: 1, username: 'alexis', email: 'a@x' }],
  creator: { id: 1, username: 'alexis', email: 'a@x' },
});

const popular = Array.from({ length: 10 }, (_, i) => game(i + 1, `Popular ${String(i + 1)}`, []));
const arcade = Array.from({ length: 4 }, (_, i) =>
  game(i + 21, `Arcade ${String(i + 1)}`, ['arcade']),
);

/** A catalogue of ten games, four of which are arcade; nothing is featured. */
async function mockCatalogue(page: Page): Promise<void> {
  await page.route('**/releases/featured', (r) => r.fulfill({ json: { featured: null } }));
  await page.route('**/projects/releases/paginated**', (r) => {
    const tags = new URL(r.request().url()).searchParams.get('tags');
    const items = tags === 'arcade' ? arcade : popular;
    return r.fulfill({ json: { projects: items, total: items.length } });
  });
}

test.describe('hub shelves', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  /**
   * Narrowing ten games to four used to take a row away from the page and give it back on the
   * next click, and the hero swapped to the head of the filtered list. The shelf holds its height
   * and the hero holds its game.
   */
  test('filtering the popular shelf keeps its height and the hero', async ({ page }) => {
    await mockCatalogue(page);
    await page.goto('/hub');

    const shelf = page.locator('nc-hub-row').first();
    await expect(shelf.locator('nc-game-card')).toHaveCount(10);
    const hero = page.locator('a[aria-label="Popular 1"]');
    await expect(hero).toBeVisible();
    const before = await shelf.boundingBox();
    if (!before) throw new Error('the popular shelf is not laid out');

    await page.getByRole('radio', { name: 'Arcade' }).click();
    await expect(shelf.locator('nc-game-card')).toHaveCount(4);
    await expect(shelf.locator('nc-game-card').first()).toContainText('Arcade 1');

    const after = await shelf.boundingBox();
    if (!after) throw new Error('the popular shelf is not laid out');
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
    await expect(hero).toBeVisible();
  });
});
