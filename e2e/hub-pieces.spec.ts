import { expect, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/ui-kit');
  await page.locator('nc-hub-pieces-section').scrollIntoViewIfNeeded();
});

test('a shelf opens the flyout of a disk the mouse rests on, and says so on its link', async ({
  page,
}) => {
  const shelf = page.getByTestId('shelf-popular');
  const link = shelf.getByRole('link', { name: 'Night Survivors' });
  await expect(link).toHaveAttribute('aria-expanded', 'false');

  await link.hover();
  await expect(link).toHaveAttribute('aria-expanded', 'true', { timeout: 3000 });
  const flyout = shelf.locator(`[id="${(await link.getAttribute('aria-controls')) ?? ''}"]`);
  await expect(link).toHaveAttribute('aria-describedby', (await flyout.getAttribute('id')) ?? '');
  await expect(flyout).toContainText('Hold the clearing until dawn');
  // The lit frame, on the pixel grid: two pixels all round and one more for its skirt.
  expect(await flyout.evaluate((el) => getComputedStyle(el).borderWidth)).toBe('6px 6px 9px');

  await page.mouse.move(0, 0);
  await expect(link).toHaveAttribute('aria-expanded', 'false');
});

test('a shelf pages on the arrow keys, keeps the other pages inert and follows with the focus', async ({
  page,
}) => {
  const shelf = page.getByTestId('shelf-popular');
  await expect(shelf.getByRole('button', { name: 'Previous page' })).toBeHidden();
  await shelf.getByRole('link', { name: 'High Tide Plinko' }).focus();
  await page.keyboard.press('ArrowRight');

  await expect(shelf.locator('[aria-live]')).toHaveText('Page 2 of 4');
  await expect(shelf.getByRole('link', { name: 'Chaser of Dawn' })).toBeFocused();
  await expect(shelf.locator('[role="listitem"]:not([inert])')).toHaveCount(4);
  await expect(shelf.getByRole('tab', { selected: true })).toHaveAccessibleName('Page 2');
  await expect(shelf.getByRole('button', { name: 'Previous page' })).toBeVisible();
});

test('a shelf pages under a drag and resists at its first page', async ({ page }) => {
  const shelf = page.getByTestId('shelf-popular');
  const rail = shelf.locator('.rail');
  await shelf.locator('[role="listitem"]').nth(1).scrollIntoViewIfNeeded();
  const box = await shelf.locator('[role="listitem"]').nth(1).boundingBox();
  if (!box) {
    throw new Error('The shelf has no second item.');
  }
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 300, y, { steps: 5 });
  await expect(rail).toHaveCSS('left', '100px');
  await page.mouse.up();
  await expect(shelf.locator('[aria-live]')).toHaveText('Page 1 of 4');

  await page.mouse.down();
  await page.mouse.move(x - 300, y, { steps: 5 });
  await page.mouse.up();
  await expect(shelf.locator('[aria-live]')).toHaveText('Page 2 of 4');
});

test('a session disk wears its players, and joining lands the viewer on its open seat', async ({
  page,
}) => {
  const shelf = page.getByTestId('shelf-sessions');
  const item = shelf.getByRole('listitem').first();
  const link = item.getByRole('link', { name: 'Puyo Tsu' });
  await expect(item.locator('.sticker .card')).toHaveCount(3);
  await expect(item.locator('.sticker.away .card')).toHaveText('y');

  await link.focus();
  const flyout = shelf.locator(`[id="${(await link.getAttribute('aria-controls')) ?? ''}"]`);
  await expect(flyout).toContainText('2/4');

  await item.locator('.action.join .rind').click();
  await expect(page).toHaveURL(/\/ui-kit$/);
  await expect(item.locator('.sticker.away .card')).toHaveCount(0);
  await expect(item.locator('.sticker.away .seat')).toHaveCount(1);
  await expect(item.locator('.action')).toHaveCount(0);
  await expect(flyout).toContainText('3/4');

  await flyout.getByRole('button', { name: 'Leave' }).click();
  await expect(flyout).toContainText('2/4');
  await expect(item.locator('.sticker.away .card')).toHaveCount(1);
});

test('the hero pile moves one disk for a turn of the wheel and keeps the page still', async ({
  page,
}) => {
  const hero = page.getByTestId('hero-pile');
  await expect(hero.getByRole('status')).toContainText('1 of 4: High Tide Plinko');

  // One turn is several wheel events in a row. They are sent from the page in one go: sent one
  // call at a time, a slow machine spreads them past the pile's lock and it reads two turns.
  const claimed = await hero
    .getByRole('button', { name: 'Play High Tide Plinko' })
    .evaluate((under) =>
      Array.from(
        { length: 6 },
        () =>
          !under.dispatchEvent(
            new WheelEvent('wheel', { deltaY: 20, bubbles: true, cancelable: true }),
          ),
      ),
    );

  await expect(hero.getByRole('status')).toContainText('2 of 4: Night Survivors');
  await expect(hero.getByRole('button', { name: 'Play Night Survivors' })).toBeVisible();
  await expect(hero.locator('h2')).toHaveText('Night Survivors');
  // The pile keeps every event of the turn to itself, so none of them scrolls the page.
  expect(claimed).toEqual([true, true, true, true, true, true]);
});

test('a collection box fans its disks out under the mouse and brings a pressed one to the crown', async ({
  page,
}) => {
  const box = page.locator('nc-collection-box').first();
  const disks = box.locator('button.disk');
  await expect(box.getByRole('group')).toHaveAccessibleName(
    'Couch co-op, 6 games, curated by louis',
  );

  await disks.first().hover({ position: { x: 4, y: 40 } });
  await expect(box).toHaveClass(/docked/);
  await expect(disks.nth(2)).toHaveAttribute('style', /scale\(1\.333\)/);

  await disks.first().click({ position: { x: 4, y: 40 } });
  await expect(disks.nth(0)).toHaveAttribute('style', /scale\(1\.333\)/);
  await expect(box.getByRole('link', { name: /^Open Couch co-op/ })).toHaveAttribute(
    'href',
    '/ui-kit',
  );
});
