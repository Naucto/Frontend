import { expect, test } from './fixtures';
import { answer, mockSignedIn } from './mocks/session';

const LOUIS = { id: 7, username: 'louis', nickname: 'Louis' };

test.describe('friends', () => {
  test.beforeEach(async ({ page }) => {
    await mockSignedIn(page);
    // The page and the API share the path, so only the API's request is answered here.
    await page.route('**/friends', (route) =>
      route.request().resourceType() === 'document' ? route.fallback() : answer(200, [])(route),
    );
    await page.route('**/friends/recent-players', answer(200, []));
    await page.route('**/users/public/search?*', answer(200, { data: [LOUIS], total: 1 }));
  });

  test('add friend finds a person with the people search and asks them', async ({ page }) => {
    const sent: unknown[] = [];
    await page.route('**/friends/requests', (route) => {
      if (route.request().method() === 'POST') {
        sent.push(route.request().postDataJSON());
        return answer(201, {})(route);
      }
      return answer(200, [])(route);
    });

    await page.goto('/friends');
    await page.getByRole('button', { name: 'Add friend' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('searchbox').fill('lou');
    await dialog.getByRole('option', { name: /louis/ }).click();

    await expect(page.getByText('Request sent')).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(sent).toEqual([{ userId: LOUIS.id }]);
  });

  test('a refused request says why and leaves the search open', async ({ page }) => {
    await page.route('**/friends/requests', (route) =>
      route.request().method() === 'POST'
        ? answer(409, { statusCode: 409, message: 'Friend request already sent' })(route)
        : answer(200, [])(route),
    );

    await page.goto('/friends');
    await page.getByRole('button', { name: 'Add friend' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('searchbox').fill('lou');
    await dialog.getByRole('option', { name: /louis/ }).click();

    await expect(page.getByText('Friend request already sent')).toBeVisible();
    await expect(dialog.getByRole('searchbox')).toBeVisible();
  });
});
