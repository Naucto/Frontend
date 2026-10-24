import { expect, test } from './fixtures';
import { answer, mockSignedIn } from './mocks/session';

test.describe('ratings', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/projects/releases**', answer(200, { items: [], total: 0 }));
  });

  test('a signed-in player rates the platform from the footer and is thanked', async ({ page }) => {
    await mockSignedIn(page);
    await page.route('**/reports/prompt', answer(200, { eligible: false, declined: false }));
    await page.route('**/reports/ratings', answer(201, { id: 5 }));

    await page.goto('/hub');
    await page.getByRole('contentinfo').getByRole('button', { name: 'Send feedback' }).click();

    const dialog = page.getByRole('dialog', { name: 'Rate Naucto' });
    await expect(dialog.getByRole('radio', { name: 'Play games' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await dialog.getByRole('radio', { name: 'Make games' }).click();
    await dialog.getByRole('radio', { name: '8' }).click();
    await dialog.getByLabel('What did you like?').fill('Making sprites with a friend');

    const sent = page.waitForRequest('**/reports/ratings');
    await dialog.getByRole('button', { name: 'Send' }).click();
    expect((await sent).postDataJSON()).toEqual({
      score: 8,
      role: 'CREATOR',
      origin: 'MANUAL',
      liked: 'Making sprites with a friend',
    });

    const thanks = page.getByRole('dialog', { name: 'Thank you' });
    await expect(thanks.getByRole('link', { name: 'Join our Discord' })).toHaveAttribute(
      'href',
      'https://discord.gg/4fxDFCNrqW',
    );
    await thanks.getByRole('button', { name: 'OK' }).click();
    await expect(thanks).toBeHidden();
  });

  test('a signed-out reader is asked to sign in first', async ({ page }) => {
    await page.route('**/auth/refresh', answer(401, {}));

    await page.goto('/hub');
    await page.getByRole('contentinfo').getByRole('button', { name: 'Send feedback' }).click();

    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});
