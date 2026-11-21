import type { Page } from '@playwright/test';

import { answer } from './session';

/**
 * The user socket of a signed-in page: it answers the sign-in frame with these notifications, as
 * the backend does. Pair it with `mockSignedIn`.
 */
export async function mockNotifications(page: Page, notifications: unknown[]): Promise<void> {
  await page.route(
    '**/notifications/webrtc-offer',
    answer(200, { data: { signaling: ['ws://localhost/e2e-user-socket'] } }),
  );
  await page.routeWebSocket(/e2e-user-socket/, (socket) => {
    socket.onMessage((frame) => {
      if ((JSON.parse(String(frame)) as { type: string }).type === 'auth') {
        socket.send(JSON.stringify({ type: 'notifications:init', payload: notifications }));
      }
    });
  });
}
