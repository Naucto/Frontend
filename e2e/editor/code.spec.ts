import type { Page } from '@playwright/test';

import { editorUrl, mockEditor } from '../editor-mocks';
import { expect, test } from '../fixtures';
import { boxOf, lit, screenPixels } from './helpers';

test.use({ viewport: { width: 1920, height: 1030 } });

test.beforeEach(async ({ page }) => {
  await mockEditor(page);
});

test('CODE tab runs the starter game', async ({ page }) => {
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await expect(page.getByText('Welcome to Naucto!').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/v-editor-code.png' });
});

/**
 * The active file tab's gold cap, pinned against Tailwind's stylesheet-order conflict resolution.
 */
test('the active file tab wears its gold cap', async ({ page }) => {
  await page.goto(editorUrl('code'));
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
 * The frame is presented upright: the starter moon's top row is solid and its bottom row empty.
 */
test('the screen is not mirrored top to bottom', async ({ page }) => {
  await page.goto(editorUrl('code'));
  await expect(page.getByText('Welcome to Naucto!').first()).toBeVisible();

  // Opening the editor mounts the game and runs `_init` — which is what prints the greeting —
  // but does not start it, so nothing has called `_draw` yet and the screen is still blank.
  await page.getByRole('button', { name: 'Play' }).first().click();

  // Wait for the moon to be somewhere — either end will do — so that a blank canvas cannot pass
  // for a mirrored one.
  await expect
    .poll(async () => (await lit(page, 159, 82)) || (await lit(page, 159, 97)))
    .toBe(true);

  // Row 0 of the sprite is solid and row 15 is empty. Mirrored, these swap.
  expect({ top: await lit(page, 159, 82), bottom: await lit(page, 159, 97) }).toEqual({
    top: true,
    bottom: false,
  });
});

/** Whether the viewer floats is per editor, never remembered by the browser. */
test('a reload opens the editor with the viewer docked', async ({ page }) => {
  await page.goto(editorUrl('code'));
  await page.getByRole('button', { name: 'Pop the viewer out' }).click();
  await expect(page.getByText('Viewer · 320×180')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Pop the viewer out' })).toBeVisible();
  await expect(page.getByText('Viewer · 320×180')).toHaveCount(0);
});

/**
 * Artboard 1c, "the screen is always on". Wide enough and the reference sits beside the console,
 * which keeps the running game; below that it takes the console's place and the game is paused,
 * which is the one arrangement where GAME PAUSED means anything.
 */
test('the reference opens beside the game when there is room', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1030 });
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();

  // Closed: the console column has the screen and there is no reference.
  await expect(page.locator('nc-doc-pane')).toHaveCount(0);
  await expect(page.getByText('320×180').first()).toBeVisible();

  await page.keyboard.press('F1');

  // Split: both. The game is NOT displaced — that is the whole point.
  await expect(page.locator('nc-doc-pane')).toBeVisible();
  await expect(page.getByText('320×180').first()).toBeVisible();
  await expect(page.getByText('Game paused — swap back to resume')).toHaveCount(0);

  // Beside, not above: a runtime-built grid class Tailwind never generated stacks the columns.
  const pane = await boxOf(page.locator('nc-panel-region > div').first());
  const consoleColumn = await boxOf(page.locator('nc-console-column'));
  expect(pane.x + pane.width).toBeLessThanOrEqual(consoleColumn.x + 1);
  expect(pane.y).toBeCloseTo(consoleColumn.y, 0);
  expect(Math.round(pane.width)).toBe(401);
  expect(Math.round(consoleColumn.width)).toBe(421);

  await page.screenshot({ path: 'test-results/v-editor-reference-split.png' });
});

test('the reference searches to a section, and copies a tutorial into a new game', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1030 });
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await page.keyboard.press('F1');
  const pane = page.locator('nc-doc-pane');
  await expect(pane).toBeVisible();

  const search = pane.getByPlaceholder('Search', { exact: true });
  await search.fill('heavier one every eight');
  const hit = pane.getByRole('option').first();
  await expect(hit).toContainText('Grid and Flags');
  await hit.click();
  await expect(pane.locator('#grid-and-flags')).toBeInViewport();
  await expect(pane.getByText('MAP', { exact: true }).first()).toBeVisible();

  await search.fill('Your First Game');
  await pane.getByRole('option').first().click();
  await pane.getByRole('button', { name: 'Copy to new game' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Copy to a new game?');
  await page.route('**/projects', (route) =>
    route.request().method() === 'POST' ? route.fulfill({ json: { id: 99 } }) : route.fallback(),
  );
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
  // The new game is filed under its id; nothing answers for game 99, so the seed waits there.
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('naucto.seed.99')))
    .toContain('function _update');
});

test('the reference reads without a horizontal scroll at its 401 px', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1030 });
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await page.keyboard.press('F1');
  const pane = page.locator('nc-doc-pane');
  const search = pane.getByPlaceholder('Search', { exact: true });
  const scroller = pane.locator('.overflow-auto').first();
  const overflow = (): Promise<number> =>
    scroller.evaluate((el) => Math.max(0, el.scrollWidth - el.clientWidth));

  await search.fill('Rendering');
  await pane.getByRole('option').first().click();
  await expect(pane.locator('figure.doc-diagram--authored svg').first()).toBeVisible();
  expect(await overflow()).toBe(0);
  // The API card: signature band, parameters as a list, see-also chips.
  const card = pane.locator('article.api-card#gfx\\.set_color');
  await expect(card.locator('.api-sig-name')).toHaveText('gfx.set_color');
  await expect(card.locator('dl.api-params dt').first()).toBeVisible();
  await expect(card.locator('.api-ref-chip').first()).toBeVisible();
  await card.evaluate((el) => {
    el.scrollIntoView({ block: 'start' });
  });
  await expect(pane.getByTestId('doc-anchor')).toContainText('gfx.set_color');

  await search.fill('SOUND');
  await pane.getByRole('option').first().click();
  await expect(pane.locator('figure.doc-figure img').first()).toBeVisible();
  expect(await overflow()).toBe(0);
});

test('the reference takes the console’s place when there is not', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1030 });
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();

  await page.keyboard.press('F1');

  // Swap: the reference is here, the viewer is not, and the banner explains why.
  await expect(page.locator('nc-doc-pane')).toBeVisible();
  await expect(page.getByText('Game paused — swap back to resume')).toBeVisible();

  await page.screenshot({ path: 'test-results/v-editor-reference-swap.png' });
});

/**
 * Too narrow for both, the sidebar holds one or the other and its grip switches between them both
 * ways.
 */
test('the sidebar swaps both ways where there is room for one', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1030 });
  await page.goto(editorUrl('code'));
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
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();

  await expect(page.getByRole('button', { name: 'Swap to the reference' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open the reference' }).click();

  await expect(page.locator('nc-doc-pane')).toBeVisible();
  // Beside, not instead: the running game is still there.
  await expect(page.getByText('320×180').first()).toBeVisible();
});

test('the reference stays on CODE and does not follow the reader to a canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1030 });
  await page.goto(editorUrl('code'));
  await page.getByRole('button', { name: 'Open the reference' }).click();
  await expect(page.locator('nc-doc-pane')).toBeVisible();

  for (const tab of ['game', 'art', 'map', 'sound', 'net'] as const) {
    await page.goto(editorUrl(tab));
    await expect(page.locator('nc-doc-pane')).toHaveCount(0);
    await expect(page.locator('nc-edge-handle')).toHaveCount(0);
    await expect(page.getByText('Game paused')).toHaveCount(0);

    await page.keyboard.press('F1');
    await expect(page.locator('nc-doc-pane')).toHaveCount(0);
  }

  // The wish survives the detour, so coming back does not mean asking again.
  await page.goto(editorUrl('code'));
  await expect(page.locator('nc-doc-pane')).toBeVisible();
});

test('the reference is closed from its own edge, not from a tab', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1030 });
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();

  await expect(page.getByRole('button', { name: 'DOC' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'DOC' })).toHaveCount(0);

  await page.keyboard.press('F1');
  await expect(page.locator('nc-doc-pane')).toBeVisible();

  await page.getByRole('button', { name: 'Close the reference' }).click();
  await expect(page.locator('nc-doc-pane')).toHaveCount(0);
  await expect(page.getByText('320×180').first()).toBeVisible();
});

test('typing does not put the editor into a syncing state', async ({ page }) => {
  await page.goto(editorUrl('code'));
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
  await page.goto(editorUrl('code'));
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

/** The doc card of a long call stays inside the window and scrolls. */
test('the signature card stays on screen and shows the argument being typed', async ({ page }) => {
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\ngfx.draw_sprite(0, 0, 0, 0, 0, ');

  const card = page.locator('.nc-doc-card');
  const active = card.locator('.nc-doc-card__params dt[data-active]');
  await expect(active).toBeVisible();

  // The card is its own tooltip element, and CodeMirror parks one at -10000px until the measure
  // pass that places it. Waited for, or the box read below is the parked one.
  await expect.poll(async () => (await card.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);

  const box = await card.boundingBox();
  const arg = await active.boundingBox();
  const height = page.viewportSize()?.height ?? 0;
  expect(box).not.toBeNull();
  expect(arg).not.toBeNull();
  if (!box || !arg) {
    return;
  }
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(height);
  // Scrolled to, not merely present: the sixth of eight arguments is past the fold, which the
  // scroll offset below is what proves.
  expect(arg.y).toBeGreaterThanOrEqual(box.y);
  expect(arg.y + arg.height).toBeLessThanOrEqual(box.y + box.height);
  const scroll = await card.evaluate((el) => ({
    top: el.scrollTop,
    hidden: el.scrollHeight - el.clientHeight,
  }));
  expect(scroll.hidden).toBeGreaterThan(0);
  expect(scroll.top).toBeGreaterThan(0);
});

/** The documentation cannot answer for a project's own function; its arguments have names. */
test('the signature card answers for a function the project declares', async ({ page }) => {
  await page.goto(editorUrl('code'));
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

test('a sprite keeps the first colour clear, and draws it when told nil', async ({ page }) => {
  await page.goto(editorUrl('code'));
  await expect(page.getByText('Welcome to Naucto!').first()).toBeVisible();

  const pixel = async (): Promise<string> => {
    const [red, green, blue] = await screenPixels(page, 3, 3, 1, 1);
    return `${String(red)},${String(green)},${String(blue)}`;
  };

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

/** The file strip fits at this width, so it says nothing about a scroll it does not need. */
test('a strip that fits offers no arrows', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(editorUrl('code'));
  const files = page
    .locator('nc-tabs')
    .filter({ has: page.getByRole('tablist', { name: 'Files' }) });
  await expect(files.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await expect(files.getByRole('button', { name: 'Later tabs' })).toHaveCount(0);
  await expect(files.getByRole('button', { name: 'Earlier tabs' })).toHaveCount(0);
});

test('a tab is named and coloured in a dialog, and the last one cannot be removed', async ({
  page,
}) => {
  await page.goto(editorUrl('code'));
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

test('a copied tutorial arrives with its sprites, flags and map', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'naucto.seed.7',
      JSON.stringify({
        name: 'Tutorial',
        code: 'function _draw() gfx.clear(0) print(map.get(2, 5) .. " " .. tostring(map.flag(40, 1))) end',
        assets: {
          sprites: { '40': ['4444....'] },
          flags: { '40': 2 },
          map: [{ row: 5, from: 1, to: 3, tile: 40 }],
        },
      }),
    );
  });
  await page.goto(editorUrl('code'));
  await page.getByRole('tab', { name: 'main', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Play' }).first().click();
  await expect(page.getByText('40 true').first()).toBeVisible();
});

/** The one control in the CODE strip still spelled out. */
test('FIND is a magnifier beside the plus', async ({ page }) => {
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();

  const find = page.getByRole('button', { name: 'Find' });
  await expect(find).toBeVisible();
  await expect(find).toHaveText('');
  await expect(find.locator('nc-icon')).toBeVisible();
});

/**
 * The search arrows keep focus in the bar, paint their matches without the library's panel, and
 * keep moving across a file switch.
 */
test('FIND arrows walk the matches and leave the caret in the bar', async ({ page }) => {
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Find' }).click();

  const field = page.getByRole('textbox', { name: 'Find' });
  const next = page.getByRole('button', { name: 'Next match' });
  const line = page.getByText(/^LN \d+/);
  await field.fill('function');
  await next.click();
  await expect(line).toHaveText(/LN 10 /);
  await next.click();
  await expect(line).toHaveText(/LN 14 /);
  await expect(field).toBeFocused();
  await expect(page.locator('.cm-searchMatch').count()).resolves.toBeGreaterThanOrEqual(2);
  await expect(page.locator('.cm-searchMatch-selected')).toHaveText('function');

  // A word that only a comment holds: the highlighter reads the text, not the syntax tree.
  await field.fill('starter');
  await expect(page.locator('.cm-searchMatch').count()).resolves.toBeGreaterThanOrEqual(1);

  await field.fill('function');
  await page.getByRole('button', { name: 'New file' }).click();
  await page.getByLabel('Tab name').fill('player');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('tab', { name: 'player', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'main', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('_init');
  await next.click();
  await expect(line).toHaveText(/LN 10 /);
});

/**
 * What the synth was told, in the order it was told. The music plays in an audio graph a test
 * cannot listen to, so the commands on their way there are the one place the transport shows.
 */
async function recordSynthCommands(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __synthLog: string[] }).__synthLog = log;
    const port: { postMessage(...args: [unknown, ...unknown[]]): void } = MessagePort.prototype;
    const post = port.postMessage;
    port.postMessage = function (this: MessagePort, ...args) {
      const [msg] = args;
      if (
        typeof msg === 'object' &&
        msg !== null &&
        'type' in msg &&
        typeof msg.type === 'string'
      ) {
        log.push(msg.type);
      }
      post.apply(this, args);
    };
  });
}

const lastSynthCommand = (page: Page): Promise<string | undefined> =>
  page.evaluate(() => (window as unknown as { __synthLog: string[] }).__synthLog.at(-1));

test('pausing the game holds the music', async ({ page }) => {
  await recordSynthCommands(page);
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Play' }).first().click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(() => lastSynthCommand(page)).toBe('pause');

  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => lastSynthCommand(page)).toBe('resume');
});

/**
 * Docked, the viewer is only on screen on the CODE tab; the canvas tabs collapse its column. A
 * game nobody can see is paused, not stopped -- stopping would end the netplay session the column
 * stays mounted to keep -- and comes back with the tab.
 */
test('hiding the viewer holds the music', async ({ page }) => {
  await recordSynthCommands(page);
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).first().click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

  await page.locator('nc-rail').getByRole('button', { name: 'Art' }).click();
  await expect.poll(() => lastSynthCommand(page)).toBe('pause');

  await page.locator('nc-rail').getByRole('button', { name: 'Code' }).click();
  await expect.poll(() => lastSynthCommand(page)).toBe('resume');
});

/** A background tab gets no animation frames, so the music holds with the stalled game. */
test('a hidden tab holds the music', async ({ page }) => {
  await recordSynthCommands(page);
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).first().click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

  const setHidden = (hidden: boolean): Promise<void> =>
    page.evaluate((isHidden) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);

  await setHidden(true);
  await expect.poll(() => lastSynthCommand(page)).toBe('pause');
  await setHidden(false);
  await expect.poll(() => lastSynthCommand(page)).toBe('resume');
});

test('Step one frame advances a paused game by one update, and pauses a running one', async ({
  page,
}) => {
  await page.goto(editorUrl('code'));
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).first().click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('tab', { name: 'Perf' }).click();
  // The readout samples the engine on a timer: let it catch up with the pause before reading.
  const frame = page.getByText(/^FRAME \d+$/);
  const read = async (): Promise<number> =>
    Number((await frame.textContent())?.replace('FRAME ', ''));
  await expect
    .poll(async () => {
      const before = await read();
      await page.waitForTimeout(400);
      return (await read()) - before;
    })
    .toBe(0);
  const frameNumber = await read();
  await page.getByRole('button', { name: 'Step one frame' }).click();
  await expect(frame).toHaveText(`FRAME ${String(frameNumber + 1)}`);

  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Step one frame' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});
