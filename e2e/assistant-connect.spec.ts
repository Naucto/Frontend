import { uuidOf } from '../packages/api-client/testing';
import { expect, test } from './fixtures';
import { mockSignedIn } from './mocks/session';

test('an assistant is connected with the code it shows, and disconnected from the settings', async ({
  page,
}) => {
  await mockSignedIn(page);
  const answers: string[] = [];
  const grants = [
    {
      id: uuidOf(3),
      clientName: 'Codex on the server',
      createdAt: '2026-11-28T09:00:00.000Z',
      lastUsedAt: null,
    },
  ];
  await page.route('**/ai/device/ACDE-FGHJ', (route) =>
    route.fulfill({
      json: { clientName: 'Codex on the server', expiresAt: '2026-11-28T10:00:00.000Z' },
    }),
  );
  await page.route('**/ai/device/ACDE-FGHJ/approve', (route) => {
    answers.push('approve');
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/ai/grants', (route) => route.fulfill({ json: grants }));
  await page.route(`**/ai/grants/${uuidOf(3)}`, (route) => {
    grants.length = 0;
    return route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/assistant/connect?code=acdefghj');
  await expect(page.getByLabel('Code')).toHaveValue('ACDE-FGHJ');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Codex on the server asks to work on your games.')).toBeVisible();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText('Connected: you can go back to your assistant.')).toBeVisible();
  expect(answers).toEqual(['approve']);

  await page.getByRole('link', { name: 'Manage assistants' }).click();
  await expect(page.getByText('Codex on the server')).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByText('No assistant connected')).toBeVisible();
});
