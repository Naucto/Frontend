import { expect, test } from './fixtures';
import { serveGame } from './mocks/game';
import { answer, mockSignedIn } from './mocks/session';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const featuresOn = answer(200, { monetization: false, analytics: false, feedback: true });

test.describe('bug reports', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/features', featuresOn);
    await page.route('**/projects/releases**', answer(200, { items: [], total: 0 }));
  });

  test('a signed-in player reports a problem from the bar, with a screenshot', async ({ page }) => {
    await mockSignedIn(page);
    await page.route('**/feedback/prompt', answer(200, { eligible: false, declined: false }));
    await page.route('**/feedback/bugs', answer(201, { id: 31 }));

    await page.goto('/hub');
    await page.getByTestId('report-problem').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Report a problem' })).toBeVisible();
    const send = dialog.getByRole('button', { name: 'Send report' });
    await expect(send).toBeDisabled();

    await dialog.getByRole('radio', { name: 'Sound' }).click();
    await dialog.getByLabel('Summary').fill('No music on the hub');
    await dialog.getByLabel('What happened?').fill('The hub trailer plays without any sound.');
    await dialog
      .locator('input[type=file]')
      .setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: PNG });
    await expect(dialog.getByRole('img', { name: 'The screenshot attached' })).toBeVisible();

    const sent = page.waitForRequest('**/feedback/bugs');
    await send.click();
    const request = await sent;
    const body = request.postDataBuffer()?.toString('latin1') ?? '';
    expect(request.headers()['content-type']).toContain('multipart/form-data');
    expect(body).toContain('name="category"\r\n\r\nSOUND');
    expect(body).toContain('name="route"\r\n\r\n/hub');
    expect(body).toContain('name="screenshot"');
    const thanks = page.getByRole('dialog', { name: 'Thank you' });
    await expect(thanks).toContainText('Report #31 reached the team.');
    await expect(thanks.getByRole('link', { name: 'Join our Discord' })).toHaveAttribute(
      'href',
      'https://discord.gg/4fxDFCNrqW',
    );
    await thanks.getByRole('button', { name: 'OK' }).click();
    await expect(thanks).toBeHidden();
    await expect(dialog).toBeHidden();
  });

  test('a signed-out reader is asked to sign in first', async ({ page }) => {
    await page.route('**/auth/refresh', answer(401, {}));

    await page.goto('/hub');
    await page.getByTestId('report-problem').click();

    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});

test('an uncaught error is reported once, with no account attached', async ({ page }) => {
  await page.route('**/features', featuresOn);
  await page.route('**/projects/releases**', answer(200, { items: [], total: 0 }));
  await mockSignedIn(page);
  await page.route('**/feedback/prompt', answer(200, { eligible: false, declined: false }));
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
  });
  await expect(page.getByRole('button', { name: 'Report', exact: true })).toBeVisible();
});

test('a game that stops on an error offers to report it', async ({ page }) => {
  await page.route('**/features', featuresOn);
  await serveGame(page, 'function _update()\n  local t = nil\n  t.x = 1\nend');

  await page.goto('/play/42');
  await page.getByRole('button', { name: 'Play' }).first().click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('The game stopped on an error');
  await expect(alert.getByRole('button', { name: 'Report a problem' })).toBeVisible();
});
