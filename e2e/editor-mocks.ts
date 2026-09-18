import type { Page } from '@playwright/test';

const project = {
  id: 7,
  name: 'Platformer',
  shortDesc: 'A tiny run-and-jump built as a tutorial.',
  longDesc: 'Move the moon with the arrow keys or a gamepad.',
  tags: ['action', 'adventure'],
  iconUrl: null,
  status: 'IN_PROGRESS',
  monetization: 'NONE',
  price: null,
  userId: 1,
  createdAt: '',
  updatedAt: '',
  publishedAt: null,
  viewCount: 0,
  uniquePlayers: 0,
  activePlayers: 0,
  likes: 0,
  forkCount: 4,
  forkedFromId: 3,
  collaborators: [
    { id: 1, username: 'alexis' },
    { id: 4, username: 'priax' },
  ],
  creator: { id: 1, username: 'alexis' },
};

/**
 * Mocks enough of the API for the editor to open project 7 — as its host unless `hostId` names
 * someone else, in which case user 1 is a collaborator in a room somebody else hosts.
 */
export async function mockEditor(
  page: Page,
  { hostId = 1 }: { hostId?: number } = {},
): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('naucto.theme', 'dark');
  });
  await page.route('**/auth/refresh', (r) => r.fulfill({ json: { access_token: 'tok' } }));
  await page.route('**/users/profile', (r) =>
    r.fulfill({
      json: {
        id: 1,
        email: 'a@x',
        username: 'alexis',
        nickname: 'alexis',
        roles: [],
        createdAt: '',
        updatedAt: '',
        message: '',
      },
    }),
  );
  await page.route('**/notifications/webrtc-offer', (r) =>
    r.fulfill({ json: { data: { signaling: ['ws://127.0.0.1:9'] } } }),
  );
  await page.route('**/work-sessions/join/7', (r) =>
    r.fulfill({
      json: {
        roomId: 'room-7',
        hostId,
        webrtcOffer: {
          signaling: ['ws://127.0.0.1:9'],
          maxConns: 10,
          peerOpts: { config: { iceServers: [] } },
        },
      },
    }),
  );
  await page.route('**/work-sessions/leave/7', (r) => r.fulfill({ status: 204, body: '' }));
  await page.route('**/projects/7/fetchContent', (r) =>
    r.fulfill({ status: 200, body: Buffer.alloc(0), contentType: 'application/octet-stream' }),
  );
  await page.route('**/projects/7/saveContent', (r) => r.fulfill({ json: { id: 7 } }));
  await page.route('**/projects/7/image', (r) => r.fulfill({ status: 204, body: '' }));
  await page.route('**/projects/7/versions', (r) => r.fulfill({ json: [] }));
  await page.route('**/projects/7/checkpoints', (r) => r.fulfill({ json: [] }));
  await page.route('**/users/public/4/profile', (r) =>
    r.fulfill({ json: { data: { id: 4, username: 'priax', profileImageUrl: '/img/logo.svg' } } }),
  );
  await page.route('**/projects/7', (r) => r.fulfill({ json: project }));
}
