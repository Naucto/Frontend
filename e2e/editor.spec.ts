import { expect, type Page, test } from './fixtures';

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
    { id: 1, username: 'alexis', email: 'a@x' },
    { id: 4, username: 'priax', email: 'p@x' },
  ],
  creator: { id: 1, username: 'alexis', email: 'a@x' },
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
  await page.route('**/users/public/4/profile', (r) =>
    r.fulfill({ json: { data: { id: 4, username: 'priax', profileImageUrl: '/img/logo.svg' } } }),
  );
  await page.route('**/projects/7', (r) => r.fulfill({ json: project }));
}

test.use({ viewport: { width: 1920, height: 1030 } });

/**
 * How much art the sheet holds, read off the navigator.
 *
 * The panel used to print a count of used sprites and no longer does — a slot count was never what
 * the ART tab was about, and the size gauge says what a game weighs. Counting the opaque pixels of
 * the map it draws observes the same thing without asking the page to say it in words.
 */
async function inked(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('nc-sheet-view canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return -1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return -1;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n += 1;
    return n;
  });
}

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

    // Off, or the stroke never reaches the sheet: the lock holds a stroke inside the region, which
    // starts as the single sprite in hand. The old assertion here counted used slots and passed
    // with the stroke clipped away, so the test never checked the half of its name that paints.
    await page.getByRole('switch', { name: 'Lock' }).click();

    // Drawn before the viewer is floated, because the pip lands over the canvas and would take
    // the stroke instead.
    const before = await inked(page);
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + 40, box.y + 40);
      await page.mouse.down();
      await page.mouse.move(box.x + 300, box.y + 200, { steps: 10 });
      await page.mouse.up();
    }
    await expect.poll(() => inked(page)).not.toBe(before);

    // The viewer is floated from the console's own header, so it is opened where the console is.
    await page.goto('/edit/7/code');
    await page.getByRole('button', { name: 'Pop the viewer out' }).click();
    await page.goto('/edit/7/art');
    await expect(page.getByText('Viewer · 320×180')).toBeVisible();

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

    const before = await inked(page);
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await expect.poll(() => inked(page)).not.toBe(before);
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

  /** Read as a fraction of the content, which is the thing a zoom changes the size of. */
  test('zooming the sheet keeps what was in the middle', async ({ page }) => {
    await page.goto('/edit/7/art');
    const well = page.locator('nc-sprite-canvas');
    await expect(page.getByRole('img', { name: 'Sprite canvas' })).toBeVisible();

    // Far enough in that the sheet overflows the well, and away from the middle so holding it means
    // something.
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
    await well.evaluate((el) => {
      el.scrollLeft = el.scrollWidth * 0.7;
      el.scrollTop = el.scrollHeight * 0.7;
    });

    const middle = async (): Promise<number> =>
      well.evaluate((el) =>
        Math.round(((el.scrollLeft + el.clientWidth / 2) / el.scrollWidth) * 100),
      );
    const before = await middle();
    await page.getByRole('button', { name: 'Zoom in' }).click();

    await expect.poll(middle).toBe(before);
  });

  test('the sheet map follows a zoom, not only a scroll', async ({ page }) => {
    await page.goto('/edit/7/art');
    await expect(page.getByRole('img', { name: 'Sprite canvas' })).toBeVisible();

    // The frame of what the canvas is showing: the one dashed rectangle on the map, and the only
    // mark on it that a zoom moves. Read off its own geometry rather than off the painted pixels —
    // the map's canvas holds the sheet and nothing else, and a zoom does not touch the sheet.
    //
    // Its area, not either side: the well is wider than it is tall, so the first step in takes the
    // frame off the bottom of the sheet while it still spans the full width.
    const frame = page.locator('nc-sheet-view rect[stroke-dasharray]');
    const area = async (): Promise<number> =>
      Number(await frame.getAttribute('width')) * Number(await frame.getAttribute('height'));

    const before = await area();
    expect(before).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    // In, so it shows less of the sheet, so the frame covers less of the map.
    await expect.poll(area).toBeLessThan(before);
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

    // Neither of the two things the strip must not say here: not syncing, which would mean a
    // request per keystroke, and not synced, which would claim the server holds text it has never
    // been sent.
    await expect(bar).toHaveText(/Unsaved changes/);
  });

  /**
   * The documentation of the call being written, which is the moment it is worth reading. Pinned
   * on the argument too: the card is only useful if it tracks which one the caret is on.
   */
  test('the signature card follows the caret through a call', async ({ page }) => {
    await page.goto('/edit/7/code');
    await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\ngfx.draw_sprite(');

    const card = page.locator('.nc-doc-card');
    await expect(card).toBeVisible();
    await expect(card.locator('.nc-doc-card__sig')).toHaveText(/gfx\.draw_sprite/);
    await expect(card.locator('.nc-doc-card__params dt[data-active]')).toHaveText(/^n /);

    await page.keyboard.type('0, ');
    await expect(card.locator('.nc-doc-card__params dt[data-active]')).toHaveText(/^x /);

    // Closing the call ends the question, so the card goes.
    await page.keyboard.press('End');
    await page.keyboard.type(')');
    await expect(card).toHaveCount(0);
  });

  /** The documentation cannot answer for a project's own function; its arguments have names. */
  test('the signature card answers for a function the project declares', async ({ page }) => {
    await page.goto('/edit/7/code');
    await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nfunction spawn_coin(tile_x, tile_y)\nend\n');
    await page.keyboard.type('spawn_coin(');

    const sig = page.locator('.nc-doc-card__sig');
    await expect(sig).toBeVisible();
    await expect(sig).toHaveText('spawn_coin(tile_x, tile_y)');
    await expect(sig.locator('[data-active]')).toHaveText('tile_x');
  });

  /** A paste that merged with the stroke before it would take both back at once. */
  test('ART copies a selection and pastes it as one undo step', async ({ page }) => {
    await page.goto('/edit/7/art');
    const canvas = page.getByRole('img', { name: 'Sprite canvas' });
    await expect(canvas).toBeVisible();

    // Off, or the paste below is clipped to the sprite in hand: the lock stops a paste where it
    // stops a stroke.
    await page.getByRole('switch', { name: 'Lock' }).click();

    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas');
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + 90, { steps: 6 });
    await page.mouse.up();
    const painted = await inked(page);

    await page.getByRole('radio', { name: 'Select' }).click();
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 100, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.press('Control+c');

    await page.mouse.move(box.x + 200, box.y + 160);
    await page.keyboard.press('Control+v');
    // Placed, not written: what it covers is still underneath until it is settled.
    await expect.poll(() => inked(page)).toBe(painted);

    await page.keyboard.press('Enter');
    await expect.poll(() => inked(page)).not.toBe(painted);
    const pasted = await inked(page);

    await page.keyboard.press('Control+z');
    await expect.poll(() => inked(page)).toBe(painted);
    expect(pasted).not.toBe(painted);
  });

  /**
   * The gesture the keyboard tests cannot make. Clicking a toolbar button is what takes the pointer
   * off the canvas, and the paste used to anchor on the pointer -- so by the only route a button
   * can take, it landed on the selection it came from, or nowhere at all.
   */
  test('ART pastes from the toolbar, with no pointer on the canvas', async ({ page }) => {
    await page.goto('/edit/7/art');
    const canvas = page.getByRole('img', { name: 'Sprite canvas' });
    await expect(canvas).toBeVisible();
    await page.getByRole('switch', { name: 'Lock' }).click();

    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas');
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + 90, { steps: 6 });
    await page.mouse.up();

    await page.getByRole('radio', { name: 'Select' }).click();
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 100, { steps: 4 });
    await page.mouse.up();
    const painted = await inked(page);

    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await page.getByRole('button', { name: 'Paste', exact: true }).click();
    await expect.poll(() => inked(page)).toBe(painted);

    await page.keyboard.press('Enter');
    await expect.poll(() => inked(page)).not.toBe(painted);
  });

  test('ART throws a placed paste away on Escape, leaving nothing to undo', async ({ page }) => {
    await page.goto('/edit/7/art');
    const canvas = page.getByRole('img', { name: 'Sprite canvas' });
    await expect(canvas).toBeVisible();
    await page.getByRole('switch', { name: 'Lock' }).click();

    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas');
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + 90, { steps: 6 });
    await page.mouse.up();
    const painted = await inked(page);

    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await page.getByRole('button', { name: 'Paste', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect.poll(() => inked(page)).toBe(painted);

    // Nothing was written, so the undo reaches past the paste to the stroke before it.
    await page.keyboard.press('Control+z');
    await expect.poll(() => inked(page)).not.toBe(painted);
  });

  test('MAP copies a selection of tiles and pastes it as one undo step', async ({ page }) => {
    await page.goto('/edit/7/map');
    const canvas = page.getByRole('img', { name: 'Map canvas' });
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas');

    /** The status line is the only reading of a single tile the page offers. */
    const sprUnder = async (x: number, y: number): Promise<string> => {
      await page.mouse.move(x, y);
      const text = await page.getByText(/TILE \d+,\d+/).textContent();
      return /SPR (\d+)/.exec(text ?? '')?.[1] ?? '';
    };

    /**
     * Where the paste lands: the middle of the well, not of the map. `boundingBox()` on the canvas
     * gives the whole map, most of which is scrolled out of sight.
     */
    const wellMiddle = async (): Promise<{ x: number; y: number }> =>
      page.evaluate(() => {
        const el = document.querySelector('nc-map-canvas');
        if (!el) throw new Error('no well');
        const r = el.getBoundingClientRect();
        return { x: r.x + el.clientWidth / 2, y: r.y + el.clientHeight / 2 };
      });

    await page.mouse.move(box.x + 60, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 100, { steps: 6 });
    await page.mouse.up();
    expect(await sprUnder(box.x + 90, box.y + 80)).not.toBe('000');

    await page.getByRole('radio', { name: 'Select' }).click();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, box.y + 110, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.press('Control+c');

    // Out of the stamp's reach, so what turns up there can only be the paste.
    const target = { x: box.x + 340, y: box.y + 220 };
    expect(await sprUnder(target.x, target.y)).toBe('000');

    await page.keyboard.press('Control+v');
    // Placed, not written: the map is untouched until the layer is settled.
    expect(await sprUnder(target.x, target.y)).toBe('000');

    // Placed in the middle of the well, and the move tool is already in hand: drag it out to a
    // spot the stamp never reached, which is the only way what lands there can be the paste.
    const middle = await wellMiddle();
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.press('Enter');
    await expect.poll(() => sprUnder(target.x, target.y)).not.toBe('000');

    await page.keyboard.press('Control+z');
    await expect.poll(() => sprUnder(target.x, target.y)).toBe('000');
  });

  /**
   * The gesture the keyboard test cannot make. Clicking a toolbar button is what takes the pointer
   * off the canvas, and the paste used to anchor on the pointer -- so by the only route a button
   * can take, it wrote the tiles back exactly where they came from and nothing appeared to happen.
   */
  test('MAP pastes from the toolbar, with no pointer on the canvas', async ({ page }) => {
    await page.goto('/edit/7/map');
    const canvas = page.getByRole('img', { name: 'Map canvas' });
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas');

    const sprUnder = async (x: number, y: number): Promise<string> => {
      await page.mouse.move(x, y);
      const text = await page.getByText(/TILE \d+,\d+/).textContent();
      return /SPR (\d+)/.exec(text ?? '')?.[1] ?? '';
    };

    /**
     * Where the paste lands: the middle of the well, not of the map. `boundingBox()` on the canvas
     * gives the whole map, most of which is scrolled out of sight.
     */
    const wellMiddle = async (): Promise<{ x: number; y: number }> =>
      page.evaluate(() => {
        const el = document.querySelector('nc-map-canvas');
        if (!el) throw new Error('no well');
        const r = el.getBoundingClientRect();
        return { x: r.x + el.clientWidth / 2, y: r.y + el.clientHeight / 2 };
      });

    await page.mouse.move(box.x + 60, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 100, { steps: 6 });
    await page.mouse.up();

    await page.getByRole('radio', { name: 'Select' }).click();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, box.y + 110, { steps: 4 });
    await page.mouse.up();

    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await page.getByRole('button', { name: 'Paste', exact: true }).click();

    const target = { x: box.x + 340, y: box.y + 220 };
    const middle = await wellMiddle();
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.press('Enter');

    await expect.poll(() => sprUnder(target.x, target.y)).not.toBe('000');
  });

  /**
   * A running game's map.set writes a runtime layer, not the document, so the map texture -- which
   * is built from the document -- has no way to learn about it on its own.
   */
  test('a map.set at runtime reaches the screen, not only the data', async ({ page }) => {
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

    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(
      'local t = 0\nfunction _update()\nt = t + 1\nif t == 40 then map.set(0, 0, 1) end\nif t == 60 then print("TILE=" .. map.get(0, 0)) end\nend\nfunction _draw()\ngfx.clear(0)\nmap.draw(0, 0)\nend\n',
    );
    await page.getByRole('button', { name: 'Play' }).first().click();

    // Nothing on the map to start with, so the corner is the cleared colour.
    expect(await lit(3, 3)).toBe(false);
    // The document took the write: this is the half that already worked.
    await expect(page.getByText('TILE=1')).toBeVisible({ timeout: 10_000 });
    // And the screen has to agree with it.
    await expect.poll(() => lit(3, 3), { timeout: 10_000 }).toBe(true);
  });

  /**
   * A collaborator is a person the app knows the id of, so their picture is something it can go and
   * get. Listing them by initial and colour is what it does when nothing looked it up.
   */
  test('a collaborator is shown with their picture, not their initial', async ({ page }) => {
    await page.goto('/edit/7/game');
    await page.getByRole('button', { name: /share/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('img', { name: 'priax' }).locator('img')).toBeVisible();
  });

  test('a sprite keeps the first colour clear, and draws it when told nil', async ({ page }) => {
    await page.goto('/edit/7/code');
    await expect(page.getByText('Welcome to Naucto!').first()).toBeVisible();

    const pixel = (): Promise<string> =>
      page.evaluate(() => {
        const screen = document.querySelector('canvas');
        if (!screen) throw new Error('no canvas');
        const copy = document.createElement('canvas');
        copy.width = screen.width;
        copy.height = screen.height;
        const ctx = copy.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.drawImage(screen, 0, 0);
        const [r, g, b] = ctx.getImageData(3, 3, 1, 1).data;
        return `${String(r)},${String(g)},${String(b)}`;
      });

    // Sprite 0 is empty, so every one of its pixels is the first colour.
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(
      'local o = false\nfunction _update() o = sys.frame() > 40 end\nfunction _draw()\ngfx.clear(8)\nif o then gfx.draw_sprite(0, 0, 0, 1, 1, false, false, 1, nil)\nelse gfx.draw_sprite(0, 0, 0) end\nend\n',
    );
    await page.getByRole('button', { name: 'Play' }).first().click();

    const filled = await (async () => {
      await expect.poll(pixel).not.toBe('0,0,0');
      return pixel();
    })();
    await expect.poll(pixel, { timeout: 10_000 }).not.toBe(filled);
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

  test('the roll ends where the pattern ends', async ({ page }) => {
    await page.goto('/edit/7/sound');
    await page.getByRole('button', { name: 'Add instrument' }).first().click();
    const roll = page.getByRole('img', { name: 'Piano roll' });
    await expect(roll).toBeVisible();

    const steps = async (): Promise<string | null> =>
      page.getByRole('textbox', { name: 'Steps' }).inputValue();
    // The roll's own canvas is floored at the width of its window, so it does not shrink on a
    // wide screen. The track of voices under it is exactly as wide as the pattern, and has to
    // stay in step with it.
    const track = page.locator('nc-voices-lane').getByRole('img');
    const laneWidth = async (): Promise<number> =>
      await track.evaluate((el: HTMLElement) => el.offsetWidth);

    const long = await laneWidth();
    // The pattern is fresh, so nothing is past the new end and the field shortens without asking.
    await page.getByRole('button', { name: 'Steps -16' }).click();
    await expect.poll(steps).toBe('16');

    await expect.poll(laneWidth).toBeLessThan(long);
  });

  /** Three independent mechanisms, so none of these assertions stands in for another. */
  test('the head can be dragged, rewound and resumed', async ({ page }) => {
    await page.goto('/edit/7/sound');
    await page.getByRole('button', { name: 'Add instrument' }).first().click();
    const roll = page.getByRole('img', { name: 'Piano roll' });
    await expect(roll).toBeVisible();
    const box = await roll.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // The ruler rides at the top of the *view*, so it sits at the canvas top plus however far the
    // roll has been scrolled — which is not zero: the roll opens on the middle of the keyboard.
    const rulerY =
      box.y +
      (await page.evaluate(() => {
        let el = document.querySelector('nc-piano-roll canvas')?.parentElement ?? null;
        while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
        return (el?.scrollTop ?? 0) + 12;
      }));

    const head = async (): Promise<number | null> =>
      page.evaluate(() => {
        const line = document.querySelector('nc-piano-roll div.bg-hot.w-px');
        return line ? Math.round(line.getBoundingClientRect().left) : null;
      });

    await page.mouse.move(box.x + 200, rulerY);
    await page.mouse.down();
    await page.mouse.move(box.x + 320, rulerY, { steps: 8 });
    await page.mouse.up();
    const dragged = await head();
    expect(dragged).not.toBeNull();

    const rewind = page.getByRole('button', { name: 'Back to the start' });
    await rewind.click();
    await expect.poll(head).toBeLessThan(dragged ?? 0);

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(head).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const paused = await head();
    expect(paused).not.toBeNull();

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(600);
    expect(await head()).not.toBeNull();

    // Read with the head held still: rewound, the music keeps going, so a poll left to converge
    // follows it back out past where it started and says nothing about where the rewind put it.
    const running = await head();
    await rewind.click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect.poll(head).toBeLessThan(running ?? 0);
  });

  test('SOUND tab adds an instrument and paints notes', async ({ page }) => {
    await page.goto('/edit/7/sound');
    await page.getByRole('button', { name: 'Add instrument' }).first().click();
    const roll = page.getByRole('img', { name: 'Piano roll' });
    await expect(roll).toBeVisible();
    const box = await roll.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // Halfway down the roll: the ruler rides at the top of the view and a press there moves the
      // playhead instead of writing a note, so a y measured from the top of the element -- which
      // is what this used to do -- painted nothing and said nothing about it.
      const x = box.x + 56 + 30;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 60, y, { steps: 4 });
      await page.mouse.up();
    }
    await expect(page.getByText('Not used yet — paint some notes.')).toHaveCount(0);

    // The bank no longer counts what it holds -- there is no last slot to count against -- so the
    // slot itself says it took the pattern.
    const slot = page.getByRole('button', { name: 'SFX slot 0' });
    await slot.click();
    await expect(slot).toHaveAttribute('aria-pressed', 'true');
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
  const closers = page.locator('[role=tab] button[aria-label="Delete file"]');
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
