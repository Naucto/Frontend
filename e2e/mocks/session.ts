import type { Page, Route } from '@playwright/test';

/** Fulfills a route with a JSON body at the given status, so a spec names both in one call. */
export const answer =
  (status: number, body: unknown) =>
  (route: Route): Promise<void> =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** The identity most specs need and none of them disagree on: a refresh token and a profile. */
export async function mockSignedIn(
  page: Page,
  { id = 1, username = 'alexis' }: { id?: number; username?: string } = {},
): Promise<void> {
  await page.route('**/auth/refresh', (route) => route.fulfill({ json: { access_token: 'tok' } }));
  await page.route(
    '**/users/profile',
    answer(200, {
      id,
      email: 'a@x',
      username,
      nickname: username,
      role: 'User',
      createdAt: '',
      updatedAt: '',
      message: '',
    }),
  );
}
