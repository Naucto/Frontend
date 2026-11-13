import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { answer, mockSignedIn } from './mocks/session';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

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

test.describe('bug reports', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/projects/releases**', answer(200, { items: [], total: 0 }));
    await mockSignedIn(page);
    await page.route('**/reports/prompt', answer(200, { eligible: false, declined: false }));
    await page.route('**/reports/bugs', answer(201, { id: 31 }));
  });

  const report = async (page: Page): Promise<void> => {
    await page.goto('/hub');
    await page.getByTestId('report-problem').click();
    const dialog = page.getByRole('dialog', { name: 'Report a problem' });
    await expect(dialog.getByRole('button', { name: 'Send report' })).toBeDisabled();
    await dialog.getByLabel('What is it about?').selectOption({ label: 'Sound' });
    await dialog.getByLabel('Summary').fill('No music on the hub');
    await dialog.getByLabel('What happened?').fill('The hub trailer plays without any sound.');
    await dialog
      .locator('input[type=file]')
      .setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: PNG });
    await expect(dialog.getByRole('img', { name: 'The screenshot attached' })).toBeVisible();
  };

  test('a signed-in player reports a problem from the bar, the screenshot following it', async ({
    page,
  }) => {
    await page.route('**/reports/bugs/31/screenshot', (route) => route.fulfill({ status: 204 }));
    await report(page);

    const created = page.waitForRequest('**/reports/bugs');
    const attached = page.waitForRequest('**/reports/bugs/31/screenshot');
    await page.getByRole('button', { name: 'Send report' }).click();
    expect((await created).postDataJSON()).toMatchObject({
      category: 'SOUND',
      title: 'No music on the hub',
      route: '/hub',
      appRelease: 'dev',
    });
    const upload = await attached;
    expect(upload.method()).toBe('PUT');
    expect(upload.headers()['content-type']).toContain('multipart/form-data');
    expect(upload.postDataBuffer()?.toString('latin1')).toContain('name="screenshot"');

    const thanks = page.getByRole('dialog', { name: 'Thank you' });
    await expect(thanks).toContainText('Report #31 reached the team.');
    await expect(thanks).not.toContainText('could not be attached');
  });

  test('a report stands when the server refuses its screenshot, and says so', async ({ page }) => {
    await page.route('**/reports/bugs/31/screenshot', answer(413, { message: 'Too large' }));
    await report(page);

    await page.getByRole('button', { name: 'Send report' }).click();

    const thanks = page.getByRole('dialog', { name: 'Thank you' });
    await expect(thanks).toContainText('Report #31 reached the team.');
    await expect(thanks).toContainText('The screenshot could not be attached');
  });
});

test('an uncaught error is reported once, with no account attached', async ({ page }) => {
  await page.route('**/projects/releases**', answer(200, { items: [], total: 0 }));
  await mockSignedIn(page);
  await page.route('**/reports/prompt', answer(200, { eligible: false, declined: false }));
  await page.route('**/reports/crash', (route) => route.fulfill({ status: 204 }));

  await page.goto('/hub');
  await expect(page.getByTestId('report-problem')).toBeVisible();
  const crash = page.waitForRequest('**/reports/crash');
  await page.evaluate(() => {
    setTimeout(() => {
      throw new TypeError('e2e boom');
    });
  });

  const request = await crash;
  expect(request.headers().authorization).toBeUndefined();
  expect(request.postDataJSON()).toMatchObject({
    source: 'web',
    name: 'TypeError',
    message: 'e2e boom',
    route: '/hub',
    appRelease: 'dev',
  });
  await expect(page.locator('nc-toast-host')).toContainText('e2e boom');
});
