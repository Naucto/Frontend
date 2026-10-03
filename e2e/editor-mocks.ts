import type { Page } from '@playwright/test';

import { mockSignedIn } from './mocks/session';

/** The one project every editor spec opens, and the one history endpoint for each of its ids. */
export const PROJECT_ID = 7;

export type EditorTab = 'game' | 'code' | 'art' | 'map' | 'sound' | 'net';

/** `/edit/<PROJECT_ID>/<tab>`, so a spec names the tab and never the id. */
export const editorUrl = (tab: EditorTab): string => `/edit/${String(PROJECT_ID)}/${tab}`;

/** A glob for one of project 7's own endpoints, e.g. `projectRoute('checkpoints/*')`. */
export const projectRoute = (path = ''): string =>
  `**/projects/${String(PROJECT_ID)}${path ? `/${path}` : ''}`;

const HOST_ID = 1;
const COLLABORATOR_ID = 4;

const project = {
  id: PROJECT_ID,
  name: 'Platformer',
  shortDesc: 'A tiny run-and-jump built as a tutorial.',
  longDesc: 'Move the moon with the arrow keys or a gamepad.',
  tags: ['action', 'adventure'],
  iconUrl: null,
  status: 'IN_PROGRESS',
  monetization: 'NONE',
  price: null,
  userId: HOST_ID,
  createdAt: '',
  updatedAt: '',
  publishedAt: null,
  viewCount: 0,
  uniquePlayers: 0,
  likes: 0,
  forkCount: 4,
  forkedFromId: 3,
  collaborators: [
    { id: HOST_ID, username: 'alexis' },
    { id: COLLABORATOR_ID, username: 'priax' },
  ],
  creator: { id: HOST_ID, username: 'alexis' },
};

/** One saved state, as the versions/checkpoints endpoints list it. */
interface HistoryEntry {
  name: string;
  date: string;
}

/**
 * Mocks enough of the API for the editor to open project 7 — as its host unless `hostId` names
 * someone else, in which case user 1 is a collaborator in a room somebody else hosts. The server's
 * cap on named versions is `maxCheckpoints`, generous unless a test is about the cap. The game
 * opens empty unless `content` is a saved document, which is what a capture for the docs wants,
 * and is called `name` in the header, which a capture of a tutorial's game sets to the page's title.
 * `versions`/`checkpoints` seed the two histories the versions popover reads, and `onSave` runs on
 * every write of the content — a spec that needs to overwrite or track an endpoint of its own still can,
 * by routing it after this call.
 */
export async function mockEditor(
  page: Page,
  {
    hostId = HOST_ID,
    maxCheckpoints = 20,
    theme = 'dark',
    content = Buffer.alloc(0),
    name = project.name,
    versions = [],
    checkpoints = [],
    onSave,
  }: {
    hostId?: number;
    maxCheckpoints?: number;
    theme?: 'dark' | 'light';
    content?: Buffer;
    name?: string;
    versions?: HistoryEntry[];
    checkpoints?: HistoryEntry[];
    onSave?: () => void;
  } = {},
): Promise<void> {
  await page.addInitScript((value) => {
    localStorage.setItem('naucto.theme', value);
  }, theme);
  await mockSignedIn(page, { id: HOST_ID, username: 'alexis' });
  await page.route('**/notifications/webrtc-offer', (route) =>
    route.fulfill({ json: { data: { signaling: ['ws://127.0.0.1:9'] } } }),
  );
  await page.route(`**/work-sessions/join/${String(PROJECT_ID)}`, (route) =>
    route.fulfill({
      json: {
        roomId: `room-${String(PROJECT_ID)}`,
        hostId,
        webrtcOffer: {
          signaling: ['ws://127.0.0.1:9'],
          maxConns: 10,
          peerOpts: { config: { iceServers: [] } },
        },
      },
    }),
  );
  await page.route(`**/work-sessions/leave/${String(PROJECT_ID)}`, (route) =>
    route.fulfill({ status: 204, body: '' }),
  );
  await page.route(projectRoute('content'), (route) => {
    if (route.request().method() === 'PATCH') {
      onSave?.();
      return route.fulfill({ json: { id: PROJECT_ID } });
    }
    return route.fulfill({ status: 200, body: content, contentType: 'application/octet-stream' });
  });
  await page.route(projectRoute('image'), (route) => route.fulfill({ status: 204, body: '' }));
  await page.route(projectRoute('versions'), (route) => route.fulfill({ json: { versions } }));
  await page.route(projectRoute('checkpoints'), (route) =>
    route.fulfill({ json: { checkpoints } }),
  );
  await page.route('**/projects/limits', (route) =>
    route.fulfill({ json: { maxCheckpoints, maxAutosaves: 5 } }),
  );
  await page.route(`**/users/public/${String(COLLABORATOR_ID)}/profile`, (route) =>
    route.fulfill({
      json: { data: { id: COLLABORATOR_ID, username: 'priax', profileImageUrl: '/img/logo.svg' } },
    }),
  );
  await page.route(projectRoute(), (route) => route.fulfill({ json: { ...project, name } }));
}
