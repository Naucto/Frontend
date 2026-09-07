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
    await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
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
    const tab = page.getByRole('tab', { name: 'main', exact: true });
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

    // The console is CODE's own sidebar: on a canvas tab there is nothing to unfold.
    await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(page.getByText('Viewer · 320×180')).toHaveCount(0);

    // The viewer is floated from the console's own header, so it is opened where the console is.
    await page.goto('/edit/7/code');
    await page.getByRole('button', { name: 'Pop the viewer out' }).click();
    await page.goto('/edit/7/art');
    await expect(page.getByText('Viewer · 320×180')).toBeVisible();

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
   * Cropped, the canvas is the region, so every coordinate in it carries the region's origin. A
   * stroke that lands on the wrong pixels looks right while it happens and paints out of sight.
   */
  test('ART paints the pixel under the pointer while cropped', async ({ page }) => {
    await page.goto('/edit/7/art');
    const canvas = page.getByRole('img', { name: 'Sprite canvas' });
    await expect(canvas).toBeVisible();

    await page.getByRole('switch', { name: /crop/i }).click();
    // Away from the sheet's origin, so an unoffset coordinate would miss.
    await page.getByRole('img', { name: /Sheet map/ }).click({ position: { x: 130, y: 90 } });

    const before = await page.getByText(/\d+ \/ 256 used/).textContent();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await expect(page.getByText(/\d+ \/ 256 used/)).not.toHaveText(String(before));
  });

  /**
   * Artboard 1c, "the screen is always on". Wide enough and the reference sits beside the console,
   * which keeps the running game; below that it takes the console's place and the game is paused,
   * which is the one arrangement where GAME PAUSED means anything.
   */
  test('the reference opens beside the game when there is room', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1030 });
    await page.goto('/edit/7/code');
    await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();

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
    const pane = await page.locator('nc-panel-region > div').first().boundingBox();
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
    await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();

    await page.keyboard.press('F1');

    // Swap: the reference is here, the viewer is not, and the banner explains why.
    await expect(page.locator('nc-doc-pane')).toBeVisible();
    await expect(page.getByText('Game paused — swap back to resume')).toBeVisible();

    await page.screenshot({ path: 'test-results/v-editor-reference-swap.png' });
  });

  /** There is no DOC tab and no DOC button — the design has neither. */
  /**
   * Too narrow for both, the sidebar holds one or the other and its grip is the way across. It used
   * to be a one-way door: the reference could be dismissed and only a keystroke brought it back.
   */
  test('the sidebar swaps both ways where there is room for one', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1030 });
    await page.goto('/edit/7/code');
    await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();

    await expect(page.locator('nc-doc-pane')).toHaveCount(0);
    await page.getByRole('button', { name: 'Swap to the reference' }).click();
    await expect(page.locator('nc-doc-pane')).toBeVisible();

    await page.getByRole('button', { name: 'Swap back to the game' }).click();
    await expect(page.locator('nc-doc-pane')).toHaveCount(0);
    await expect(page.getByText('320×180').first()).toBeVisible();
  });

  test('the console grip unfolds the reference where both fit', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1030 });
    await page.goto('/edit/7/code');
    await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Swap to the reference' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open the reference' }).click();

    await expect(page.locator('nc-doc-pane')).toBeVisible();
    // Beside, not instead: the running game is still there.
    await expect(page.getByText('320×180').first()).toBeVisible();
  });

  test('the reference stays on CODE and does not follow the reader to a canvas', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1030 });
    await page.goto('/edit/7/code');
    await page.getByRole('button', { name: 'Open the reference' }).click();
    await expect(page.locator('nc-doc-pane')).toBeVisible();

    for (const tab of ['game', 'art', 'map', 'sound', 'net']) {
      await page.goto(`/edit/7/${tab}`);
      await expect(page.locator('nc-doc-pane')).toHaveCount(0);
      await expect(page.locator('nc-edge-handle')).toHaveCount(0);
      await expect(page.getByText('Game paused')).toHaveCount(0);

      await page.keyboard.press('F1');
      await expect(page.locator('nc-doc-pane')).toHaveCount(0);
    }

    // The wish survives the detour, so coming back does not mean asking again.
    await page.goto('/edit/7/code');
    await expect(page.locator('nc-doc-pane')).toBeVisible();
  });

  test('the reference is closed from its own edge, not from a tab', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1030 });
    await page.goto('/edit/7/code');
    await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();

    await expect(page.getByRole('button', { name: 'DOC' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'DOC' })).toHaveCount(0);

    await page.keyboard.press('F1');
    await expect(page.locator('nc-doc-pane')).toBeVisible();

    await page.getByRole('button', { name: 'Close the reference' }).click();
    await expect(page.locator('nc-doc-pane')).toHaveCount(0);
    await expect(page.getByText('320×180').first()).toBeVisible();
  });

  /**
   * Read as pixels because the frame is drawn rather than laid out — and nothing else on this map
   * answers to zoom, the region it also draws being unchanged by it, so a difference here is the
   * frame or nothing.
   */
  /**
   * Onion ghosts the frame before this one underneath it. Uncropped, that frame is already on
   * screen beside the current one, so the control has nothing to offer and is not drawn.
   */
  test('ONION is offered only where the sheet is cropped away', async ({ page }) => {
    await page.goto('/edit/7/art');
    await expect(page.getByRole('img', { name: 'Sprite canvas' })).toBeVisible();

    const onion = page.getByRole('switch', { name: /Onion/ });
    await expect(onion).toHaveCount(0);

    await page.getByRole('switch', { name: /Crop/ }).click();
    await expect(onion).toBeVisible();
  });

  test('the sheet map follows a zoom, not only a scroll', async ({ page }) => {
    await page.goto('/edit/7/art');
    await expect(page.getByRole('img', { name: 'Sprite canvas' })).toBeVisible();

    const map = page.getByRole('img', { name: /Sheet map/ });
    const painted = async (): Promise<string> =>
      map.evaluate((el) => (el as HTMLCanvasElement).toDataURL());

    const before = await painted();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(painted).not.toBe(before);
  });

  test('typing does not put the editor into a syncing state', async ({ page }) => {
    await page.goto('/edit/7/code');
    const bar = page.getByRole('status');
    // Opening writes once, and that write really is in flight: wait it out, or what follows is
    // measured against the arrival rather than against a settled editor.
    await expect(bar).toHaveText(/Synced/, { timeout: 15_000 });

    await page.locator('.cm-content').click();
    await page.keyboard.type('-- a note');
    // The keystrokes have to have landed, or what follows says nothing.
    await expect(page.locator('.cm-content')).toContainText('-- a note');

    await expect(bar).toHaveText(/Synced/);
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

  test('MAP picks a brush by dragging a rectangle on the sheet', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1030 });
    await page.goto('/edit/7/map');
    const picker = page.getByRole('img', { name: 'Tile picker' });
    await expect(picker).toBeVisible();

    const box = await picker.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // Half-cell offsets so each end lands inside a cell rather than on its edge. The rectangle
      // this draws is wider than it is tall, which no square brush could be.
      const cell = box.width / 16;
      await page.mouse.move(box.x + cell * 2.5, box.y + cell * 1.5);
      await page.mouse.down();
      await page.mouse.move(box.x + cell * 4.5, box.y + cell * 2.5, { steps: 8 });
      await page.mouse.up();
    }

    const map = page.getByRole('img', { name: 'Map canvas' });
    const mapBox = await map.boundingBox();
    expect(mapBox).not.toBeNull();
    if (mapBox) {
      // Read a tile the press only reaches if it put down a block rather than a single sprite.
      await page.mouse.click(mapBox.x + 40, mapBox.y + 40);
      await page.mouse.move(mapBox.x + 72, mapBox.y + 40);
    }
    await expect(page.getByText('SPR 020')).toBeVisible();
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

test('a tab is named and coloured in a dialog, and the last one cannot be removed', async ({
  page,
}) => {
  await mockEditor(page);
  await page.goto('/edit/7/code');
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();

  // Counted in the DOM rather than by role: the close button is hidden until its tab is hovered,
  // so a count through the accessibility tree would read zero whether the guard held or not.
  const closers = page.locator('[role=tab] button[aria-label="Remove file"]');
  await expect(closers).toHaveCount(0);

  await page.getByRole('button', { name: 'New file' }).click();
  await expect(page.getByRole('heading', { name: 'New tab' })).toBeVisible();
  await page.getByLabel('Tab name').fill('player');
  await page.getByRole('button', { name: 'Palette slot 4' }).click();
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('tab', { name: 'player', exact: true })).toBeVisible();
  // The entry is among them: what a project keeps is a tab, not that one.
  await expect(closers).toHaveCount(2);
});
