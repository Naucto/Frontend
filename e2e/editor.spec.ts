import { expect, type Page, test } from '@playwright/test';

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
};

/** Mocks enough of the API for the editor to open project 7 as its host. */
async function mockEditor(page: Page): Promise<void> {
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
        hostId: 1,
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
  await page.route('**/projects/7', (r) => r.fulfill({ json: project }));
}

test.use({ viewport: { width: 1920, height: 1030 } });

test.describe('editor', () => {
  test.beforeEach(async ({ page }) => {
    await mockEditor(page);
  });

  test('GAME tab binds the project meta', async ({ page }) => {
    await page.goto('/edit/7/game');
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Platformer');
    await expect(page.getByText('Forked from')).toBeVisible();
    await page.screenshot({ path: 'test-results/v-editor-game.png' });
  });

  test('CODE tab runs the starter game', async ({ page }) => {
    await page.goto('/edit/7/code');
    await expect(page.getByRole('tab', { name: 'main.lua' })).toBeVisible();
    await expect(page.getByText('Welcome to Naucto!').first()).toBeVisible();
    await page.screenshot({ path: 'test-results/v-editor-code.png' });
  });

  /**
   * Same class-order trap as the nav link, in the place it is hardest to see: the active file tab's
   * gold cap resolved to `transparent` because `border-t-transparent` and `border-t-gold` were both
   * on the element. A tab strip with no cap still looks deliberate, which is why this is pinned.
   */
  test('the active file tab wears its gold cap', async ({ page }) => {
    await page.goto('/edit/7/code');
    const tab = page.getByRole('tab', { name: 'main.lua' });
    await expect(tab).toBeVisible();

    // Scoped to this tab, not to `[role=tab][aria-selected=true]`: the console strip carries a
    // selected tab too, and a document-wide query reads whichever the DOM happens to order first.
    const cap = await tab.evaluate((el) => getComputedStyle(el).borderTopColor);
    const gold = await page.evaluate(() => {
      const probe = document.createElement('span');
      document.body.appendChild(probe);
      probe.style.color = 'var(--color-gold)';
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    });

    expect(cap).toBe(gold);
  });

  /**
   * The present pass used one row number for two things — the scanline table and the frame it
   * samples — so every game came out mirrored top to bottom, for as long as there have been games.
   *
   * The starter draws a 16x16 moon at (152, 82). Its top row is solid and its bottom row is empty,
   * which is the cheapest asymmetry there is to read back, and the WebGL context keeps its drawing
   * buffer, so the last frame can be copied out at any time.
   */
  test('the screen is not mirrored top to bottom', async ({ page }) => {
    await page.goto('/edit/7/code');
    await expect(page.getByText('Welcome to Naucto!').first()).toBeVisible();

    const lit = (x: number, y: number): Promise<boolean> =>
      page.evaluate(
        ([px, py]) => {
          const screen = document.querySelector('canvas');
          if (!screen) throw new Error('no canvas');
          const copy = document.createElement('canvas');
          copy.width = screen.width;
          copy.height = screen.height;
          const ctx = copy.getContext('2d');
          if (!ctx) throw new Error('no 2d context');
          ctx.drawImage(screen, 0, 0);
          const [r, g, b] = ctx.getImageData(px ?? 0, py ?? 0, 1, 1).data;
          return (r ?? 0) + (g ?? 0) + (b ?? 0) > 120;
        },
        [x, y],
      );

    // Opening the editor mounts the game and runs `_init` — which is what prints the greeting —
    // but does not start it, so nothing has called `_draw` yet and the screen is still blank.
    await page.getByRole('button', { name: 'Play' }).first().click();

    // Wait for the moon to be somewhere — either end will do — so that a blank canvas cannot pass
    // for a mirrored one.
    await expect.poll(async () => (await lit(159, 82)) || (await lit(159, 97))).toBe(true);

    // Row 0 of the sprite is solid and row 15 is empty. Mirrored, these swap.
    expect({ top: await lit(159, 82), bottom: await lit(159, 97) }).toEqual({
      top: true,
      bottom: false,
    });
  });

  test('ART tab gives the canvas the console’s width, and paints with the pen', async ({
    page,
  }) => {
    await page.goto('/edit/7/art');
    const canvas = page.getByRole('img', { name: 'Sprite canvas' });
    await expect(canvas).toBeVisible();

    // The design gives the canvas tabs three columns, not four: the console belongs beside CODE,
    // where the machine talks back while you type. So it starts collapsed here — but the viewer
    // does not go with it. It floats over the canvas, which is the whole point of these tabs, and
    // it was being unmounted along with the column it no longer lives in.
    await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(page.getByText('Viewer · 320×180')).toBeVisible();
    // The console itself comes back when asked.
    await page.getByRole('button', { name: 'Show the panel' }).click();
    await expect(page.getByRole('button', { name: 'Clear' })).toBeVisible();
    await page.getByRole('button', { name: 'Collapse the panel' }).click();
    await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0);

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + 40, box.y + 40);
      await page.mouse.down();
      await page.mouse.move(box.x + 300, box.y + 200, { steps: 10 });
      await page.mouse.up();
    }
    await expect(page.getByText(/\d+ \/ 256 used/)).toBeVisible();
    await page.screenshot({ path: 'test-results/v-editor-art.png' });
  });

  /**
   * Artboard 1c, "the screen is always on". Wide enough and the reference sits beside the console,
   * which keeps the running game; below that it takes the console's place and the game is paused,
   * which is the one arrangement where GAME PAUSED means anything.
   */
  test('the reference opens beside the game when there is room', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1030 });
    await page.goto('/edit/7/code');
    await expect(page.getByRole('tab', { name: 'main.lua' })).toBeVisible();

    // Closed: the console column has the screen and there is no reference.
    await expect(page.locator('nc-doc-pane')).toHaveCount(0);
    await expect(page.getByText('320×180').first()).toBeVisible();

    await page.keyboard.press('F1');

    // Split: both. The game is NOT displaced — that is the whole point.
    await expect(page.locator('nc-doc-pane')).toBeVisible();
    await expect(page.getByText('320×180').first()).toBeVisible();
    await expect(page.getByText('Game paused — swap back to resume')).toHaveCount(0);

    // Beside, not above. Presence alone passed happily while a runtime-built grid class Tailwind
    // had never generated left all four columns stacked down the page.
    const pane = await page.locator('nc-doc-pane').boundingBox();
    const console_ = await page.locator('nc-console-column').boundingBox();
    expect(pane).not.toBeNull();
    expect(console_).not.toBeNull();
    if (pane && console_) {
      expect(pane.x + pane.width).toBeLessThanOrEqual(console_.x + 1);
      expect(pane.y).toBeCloseTo(console_.y, 0);
      expect(Math.round(pane.width)).toBe(401);
      expect(Math.round(console_.width)).toBe(421);
    }

    await page.screenshot({ path: 'test-results/v-editor-reference-split.png' });
  });

  test('the reference takes the console’s place when there is not', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1030 });
    await page.goto('/edit/7/code');
    await expect(page.getByRole('tab', { name: 'main.lua' })).toBeVisible();

    await page.keyboard.press('F1');

    // Swap: the reference is here, the viewer is not, and the banner explains why.
    await expect(page.locator('nc-doc-pane')).toBeVisible();
    await expect(page.getByText('Game paused — swap back to resume')).toBeVisible();

    await page.screenshot({ path: 'test-results/v-editor-reference-swap.png' });
  });

  /** There is no DOC tab and no DOC button — the design has neither. */
  test('the reference is closed from its own edge, not from a tab', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1030 });
    await page.goto('/edit/7/code');
    await expect(page.getByRole('tab', { name: 'main.lua' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'DOC' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'DOC' })).toHaveCount(0);

    await page.keyboard.press('F1');
    await expect(page.locator('nc-doc-pane')).toBeVisible();

    await page.getByRole('button', { name: 'Close the reference' }).click();
    await expect(page.locator('nc-doc-pane')).toHaveCount(0);
    await expect(page.getByText('320×180').first()).toBeVisible();
  });

  test('MAP tab stamps tiles', async ({ page }) => {
    await page.goto('/edit/7/map');
    const canvas = page.getByRole('img', { name: 'Map canvas' });
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 400, box.y + 160, { steps: 10 });
      await page.mouse.up();
    }
    await expect(page.getByText(/TILE \d+,\d+/)).toBeVisible();
    await page.screenshot({ path: 'test-results/v-editor-map.png' });
  });

  test('SOUND tab adds an instrument and paints notes', async ({ page }) => {
    await page.goto('/edit/7/sound');
    await page.getByRole('button', { name: 'Add instrument' }).first().click();
    const roll = page.getByRole('img', { name: 'Piano roll' });
    await expect(roll).toBeVisible();
    const box = await roll.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      const x = box.x + 56 + 30;
      const y = box.y + 24 + 23 * 12 + 6;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 60, y, { steps: 4 });
      await page.mouse.up();
    }
    await page.getByRole('button', { name: 'SFX slot 0' }).click();
    await expect(page.getByText('1 / 16')).toBeVisible();
    await page.screenshot({ path: 'test-results/v-editor-sound.png' });
  });
});
