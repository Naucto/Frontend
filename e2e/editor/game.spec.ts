import type { Locator, Page, Request } from '@playwright/test';

import { uuidOf } from '../../packages/api-client/testing';
import { BUBBLEGUM_16 } from '../../packages/engine/src/game/defaults';
import { editorUrl, mockEditor, PROJECT_ID, projectRoute, SEED_KEY } from '../editor-mocks';
import { expect, test } from '../fixtures';
import { boxOf } from './helpers';

test.use({ viewport: { width: 1920, height: 1030 } });

/** The size the API refuses a clip past. */
const CLIP_MAX_BYTES = 4 * 1024 * 1024;

/** A game that draws something moving, so a recording of it has frames that differ. */
const MOVING_GAME = [
  'local t = 0',
  'function _update()',
  '  t = t + 1',
  '  if input.pressed("jump") then print("jumped") end',
  '  if input.pressed("a") then print("pressed a") end',
  'end',
  'function _draw()',
  '  gfx.clear(1)',
  '  gfx.fill_rect((t * 3) % 320, 80, 24, 24, 9)',
  'end',
].join('\n');

/** The chip in the header, named for the game: a preset of the Inputs tab has the same name. */
const versionsChip = (page: Page): Locator =>
  page.locator('nc-versions-popover').getByRole('button', { name: 'Platformer' });

const sidebar = (page: Page): Locator => page.locator('nc-game-publishing');

/** The rows of the Inputs table that are actions, by the name the code reads each by. */
const actionNames = (page: Page): Promise<string[]> =>
  page.locator('tr[data-action] small').allTextContents();

const actionRow = (page: Page, name: string): Locator =>
  page.locator('tr[data-action]').filter({ has: page.locator('small', { hasText: name }) });

/** The file a form posted, cut out of the multipart body around it. */
function postedFile(request: Request): { type: string; bytes: Buffer } {
  const body = request.postDataBuffer() ?? Buffer.alloc(0);
  const head = body.indexOf('\r\n\r\n');
  const boundary = body.subarray(0, body.indexOf('\r\n'));
  return {
    type: /content-type:\s*([^\r\n]+)/i.exec(body.subarray(0, head).toString())?.[1] ?? '',
    bytes: body.subarray(head + 4, body.lastIndexOf(boundary) - 2),
  };
}

async function seedGame(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, code]) => {
      sessionStorage.setItem(key, JSON.stringify({ name: 'Platformer', code }));
    },
    [SEED_KEY, MOVING_GAME] as const,
  );
}

/** The frame the editor's one runtime has reached. */
const frameOf = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const { ng } = window as unknown as { ng: { getComponent(el: Element): unknown } };
    const screen = document.querySelector('nc-game-screen');
    const view = screen && (ng.getComponent(screen) as { host: { frame(): number } } | null);
    return view ? view.host.frame() : -1;
  });

/** A gamepad that holds whatever button of the standard mapping the page is told to. */
async function plugTestPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const held = new Set<number>();
    (window as unknown as { holdPadButton(button: number | null): void }).holdPadButton = (
      button,
    ) => {
      held.clear();
      if (button !== null) {
        held.add(button);
      }
    };
    navigator.getGamepads = () => [
      {
        id: 'Test pad',
        index: 0,
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 16 }, (_, i) => ({
          pressed: held.has(i),
          touched: held.has(i),
          value: held.has(i) ? 1 : 0,
        })),
      } as unknown as Gamepad,
    ];
  });
}

const holdPadButton = (page: Page, button: number | null): Promise<void> =>
  page.evaluate((held) => {
    (window as unknown as { holdPadButton(button: number | null): void }).holdPadButton(held);
  }, button);

/** Button 5 of the standard mapping: the right bumper. */
const RIGHT_BUMPER = 5;

async function openInputs(page: Page): Promise<void> {
  await page.goto(editorUrl('game'));
  await page.getByRole('tab', { name: 'Inputs' }).click();
  await expect(page.locator('tr[data-action]')).toHaveCount(9);
}

test.beforeEach(async ({ page }) => {
  await mockEditor(page);
});

test('GAME tab binds the project meta, in three tabs beside the Publishing sidebar', async ({
  page,
}) => {
  await page.goto(editorUrl('game'));
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Platformer');
  await expect(page.getByText('10 of 25')).toBeVisible();
  await expect(sidebar(page).getByText('Forked from')).toBeVisible();
  await expect(sidebar(page).getByRole('list', { name: 'In session' })).toContainText('alexis');
  // The save state is the versions chip's and the CODE tab's to say, not this bar's.
  await expect(page.getByText('last saved')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/v-editor-game.png' });

  const tabs = page.getByRole('tablist', { name: 'Game' });
  await expect(tabs.getByRole('tab')).toHaveText([/Details/, /Disk/, /Inputs\s*9/]);
  await tabs.getByRole('tab', { name: 'Disk' }).click();
  await expect(page.getByRole('group', { name: 'Finish' }).getByRole('button')).toHaveCount(8);
  await tabs.getByRole('tab', { name: 'Inputs' }).click();
  await expect(page.locator('tr[data-action]')).toHaveCount(9);
  await tabs.getByRole('tab', { name: 'Details' }).click();
  await expect(page.getByRole('textbox', { name: 'Summary' })).toBeVisible();
});

/**
 * The screen heads the sidebar and Publishing starts under it: the game lent to this tab is not
 * one of the Publishing sections, so no part of it, transport included, lies inside that panel.
 */
for (const width of [1920, 1440]) {
  test(`the game screen stands above the Publishing panel, at ${String(width)} wide`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(editorUrl('game'));
    const screen = await boxOf(sidebar(page).locator('nc-game-screen'));
    const panel = await boxOf(sidebar(page).locator('nc-panel-column'));
    expect(screen.height).toBeGreaterThan(0);
    expect(screen.y + screen.height).toBeLessThanOrEqual(panel.y);
  });
}

/**
 * One screen for the whole editor: the game started in CODE is the one the sidebar shows, still on
 * the frame it had reached, and it is that game's frame the cover is grabbed from.
 */
test('the sidebar shows the game the other tabs run, and the cover is grabbed from it', async ({
  page,
}) => {
  await seedGame(page);
  const covers: { type: string; bytes: Buffer }[] = [];
  await page.route(projectRoute('image'), (route) => {
    if (route.request().method() !== 'POST') {
      return route.fulfill({ status: 204, body: '' });
    }
    covers.push(postedFile(route.request()));
    return route.fulfill({ status: 201, json: { url: '/img/logo.svg' } });
  });

  await page.goto(editorUrl('code'));
  await page.getByRole('tab', { name: 'main', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Play' }).first().click();
  await expect.poll(() => frameOf(page)).toBeGreaterThan(5);
  const reached = await frameOf(page);

  await page.locator('nc-rail').getByRole('button', { name: 'Game' }).click();
  await expect(sidebar(page).locator('nc-game-screen canvas')).toBeVisible();
  await expect(page.locator('nc-game-screen')).toHaveCount(1);
  await expect.poll(() => frameOf(page)).toBeGreaterThan(reached);
  await expect(sidebar(page).getByRole('button', { name: 'Pause' })).toBeVisible();

  await page.getByRole('button', { name: 'Grab frame' }).click();
  await expect(page.getByText('Cover updated')).toBeVisible();
  expect(covers.map((cover) => cover.type)).toEqual(['image/png']);

  // Back in CODE the screen is the console column's again, and the game has not restarted.
  const leaving = await frameOf(page);
  await page.locator('nc-rail').getByRole('button', { name: 'Code' }).click();
  await expect(page.locator('nc-console-column nc-game-screen canvas')).toBeVisible();
  await expect(page.locator('nc-game-screen')).toHaveCount(1);
  await expect.poll(() => frameOf(page)).toBeGreaterThan(leaving);
});

test('a clip is recorded from the running game, played back, and deleted', async ({ page }) => {
  await seedGame(page);
  const stored = await mockEditor(page);
  const clips: { type: string; bytes: Buffer }[] = [];
  let removed = 0;
  await page.route(projectRoute('clip'), (route) => {
    if (route.request().method() === 'DELETE') {
      removed += 1;
      stored.clipUrl = null;
      return route.fulfill({ status: 204, body: '' });
    }
    clips.push(postedFile(route.request()));
    stored.clipUrl = '/clips/7.webm';
    return route.fulfill({ status: 201, json: { clipUrl: stored.clipUrl } });
  });
  await page.route('**/clips/7.webm', (route) =>
    route.fulfill({ body: clips.at(-1)?.bytes ?? Buffer.alloc(0), contentType: 'video/webm' }),
  );

  await page.goto(editorUrl('game'));
  const block = page.getByRole('region', { name: 'Clip' });
  await expect(block.getByText('No clip yet')).toBeVisible();

  // Nothing runs yet, and a canvas nobody draws to has nothing to record.
  await block.getByRole('button', { name: 'Record' }).click();
  await expect(block.getByRole('alert')).toContainText('The game is not running');

  await sidebar(page).getByRole('button', { name: 'Play' }).first().click();
  await block.getByRole('button', { name: 'Record' }).click();
  await expect(block.getByRole('alert')).toHaveCount(0);
  await expect(sidebar(page).getByRole('status')).toContainText('Rec');
  await expect(block.getByRole('timer')).toContainText('of 0:25');
  await expect(block.getByRole('timer')).toContainText('0:02', { timeout: 10_000 });
  await block.getByRole('button', { name: 'Stop' }).click();

  await expect.poll(() => clips.at(-1)?.type).toBe('video/webm');
  const sent = clips.at(-1)?.bytes ?? Buffer.alloc(0);
  expect(sent.length).toBeGreaterThan(1000);
  expect(sent.length).toBeLessThan(CLIP_MAX_BYTES);
  // WebM opens on the EBML magic number: what was sent is a video, not a blob given its name.
  expect(sent.subarray(0, 4).toString('hex')).toBe('1a45dfa3');

  const preview = block.getByLabel('The clip, playing in a loop');
  await expect(preview).toHaveAttribute('src', '/clips/7.webm');
  await expect(preview).toHaveJSProperty('muted', true);
  await expect(preview).toHaveJSProperty('loop', true);
  await expect
    .poll(() => preview.evaluate((video: HTMLVideoElement) => video.videoWidth))
    .toBe(320);
  await expect(block.getByText(/^\d+(\.\d+)? KB$/)).toBeVisible();
  await expect(sidebar(page).getByRole('status')).toHaveCount(0);

  await block.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(block.getByText('No clip yet')).toBeVisible();
  expect(removed).toBe(1);
});

test('a paused game cannot be recorded, and a refused clip is said in the block', async ({
  page,
}) => {
  await seedGame(page);
  await page.route(projectRoute('clip'), (route) =>
    route.fulfill({ status: 413, json: { message: 'Payload too large' } }),
  );
  await page.goto(editorUrl('game'));
  const block = page.getByRole('region', { name: 'Clip' });
  await sidebar(page).getByRole('button', { name: 'Play' }).first().click();
  await sidebar(page).getByRole('button', { name: 'Pause' }).click();
  await block.getByRole('button', { name: 'Record' }).click();
  await expect(block.getByRole('alert')).toContainText('The game is paused');

  await sidebar(page).getByRole('button', { name: 'Play' }).click();
  await block.getByRole('button', { name: 'Record' }).click();
  await expect(block.getByRole('timer')).toContainText('0:01', { timeout: 10_000 });
  // Pausing the game ends the recording, as STOP does: what was captured is the clip.
  await sidebar(page).getByRole('button', { name: 'Pause' }).click();
  await expect(block.getByRole('alert')).toContainText('over 4 MB');
  await expect(block.getByText('No clip yet')).toBeVisible();
});

test('a disk style is picked live, kept by the server, and taken back to automatic', async ({
  page,
}) => {
  const stored = await mockEditor(page);
  const sent: unknown[] = [];
  await page.route(projectRoute('disk'), (route) => {
    const { disk } = route.request().postDataJSON() as { disk: Record<string, string> | null };
    sent.push(disk);
    stored.disk = disk;
    return route.fulfill({ json: { disk } });
  });

  await page.goto(editorUrl('game'));
  await page.getByRole('tab', { name: 'Disk' }).click();
  const finishes = page.getByRole('group', { name: 'Finish' });
  // The colours offered are the game's own palette, which a new game takes from the console.
  const palette = page.getByRole('button', { name: /^Body colour \d+$/ });
  await expect(palette).toHaveCount(16);
  await expect(page.getByRole('button', { name: 'Back to automatic' })).toBeDisabled();

  await palette.nth(3).click();
  await finishes.getByRole('button', { name: 'Stripes' }).click();
  await expect.poll(() => sent.at(-1)).toEqual({ color: BUBBLEGUM_16[3], finish: 'stripes' });
  // Two picks in quick succession are one request: the first never left.
  expect(sent).toHaveLength(1);
  await expect(finishes.getByRole('button', { name: 'Stripes' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(palette.nth(3)).toHaveAttribute('aria-pressed', 'true');

  await finishes.getByRole('button', { name: 'Gradient' }).click();
  await page
    .getByRole('button', { name: /^Second colour \d+$/ })
    .nth(9)
    .click();
  await page
    .getByRole('group', { name: 'Direction' })
    .getByRole('button', { name: 'Down' })
    .click();
  await expect
    .poll(() => sent.at(-1))
    .toEqual({
      color: BUBBLEGUM_16[3],
      finish: 'gradient',
      color2: BUBBLEGUM_16[9],
      gradDir: 'v',
    });

  await page.getByRole('button', { name: 'Back to automatic' }).click();
  await expect.poll(() => sent.at(-1)).toBeNull();
  await expect(finishes.getByRole('button', { name: 'Solid' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('a refused disk style goes back to the one before, and a colour the palette lost is kept', async ({
  page,
}) => {
  const stored = await mockEditor(page);
  stored.disk = { color: '#123456', finish: 'dots' };
  await page.route(projectRoute('disk'), (route) =>
    route.fulfill({ status: 400, json: { message: 'Bad Request' } }),
  );

  await page.goto(editorUrl('game'));
  await page.getByRole('tab', { name: 'Disk' }).click();
  // Seventeen: the palette's sixteen, then the one the disk wears that is no longer among them.
  const palette = page.getByRole('button', { name: /^Body colour \d+$/ });
  await expect(palette).toHaveCount(17);
  await expect(palette.nth(16)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Not in the palette any more')).toBeVisible();

  const finishes = page.getByRole('group', { name: 'Finish' });
  await finishes.getByRole('button', { name: 'Checker' }).click();
  await expect(finishes.getByRole('button', { name: 'Checker' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('Could not change the disk')).toBeVisible();
  await expect(finishes.getByRole('button', { name: 'Dots' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('a save mirrors the game palette onto the project', async ({ page }) => {
  const updates: { palette?: string[] }[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith(`/projects/${PROJECT_ID}`)) {
      updates.push(request.postDataJSON() as { palette?: string[] });
    }
  });
  await page.goto(editorUrl('game'));
  // Opening a session as its host writes the document out once, and the project with it: the
  // server held no palette for this game.
  await expect.poll(() => updates.at(-1)?.palette).toEqual([...BUBBLEGUM_16]);
});

test('an action is added, edited and removed through one dialog', async ({ page }) => {
  await openInputs(page);
  await expect(page.getByText('9 of 32')).toBeVisible();

  await page.getByRole('button', { name: 'Add action' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add action' });
  await dialog.getByRole('textbox', { name: 'Label' }).fill('Light the lamp');
  // The name in code follows the label until its author types one.
  const name = dialog.getByRole('textbox', { name: 'Name in code' });
  await expect(name).toHaveValue('light_the_lamp');
  await name.fill('Lamp!');
  await expect(dialog.getByRole('alert')).toContainText('starts with a lowercase letter');
  await expect(dialog.getByRole('button', { name: 'Add action' })).toBeDisabled();
  await name.fill('pause');
  await expect(dialog.getByRole('alert')).toContainText('Another action already has this name');
  await name.fill('lamp');
  await dialog.getByRole('textbox', { name: 'Description' }).fill('Hold near the lamp');
  await dialog.getByRole('button', { name: 'Add action' }).click();

  await expect(page.getByText('10 of 32')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Inputs/ })).toContainText('10');
  expect((await actionNames(page)).at(-1)).toBe('lamp');
  // The new action stands open, ready for its first input.
  await expect(page.getByRole('button', { name: 'Plug an input' })).toBeVisible();

  await actionRow(page, 'lamp').getByRole('button', { name: 'Edit Light the lamp' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit action' });
  await expect(edit.getByRole('textbox', { name: 'Description' })).toHaveValue(
    'Hold near the lamp',
  );
  await edit.getByRole('textbox', { name: 'Label' }).fill('Lamp');
  await edit.getByRole('textbox', { name: 'Name in code' }).fill('light');
  await expect(edit.getByText('Code that reads "lamp" is not rewritten.')).toBeVisible();
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(actionRow(page, 'light')).toContainText('Lamp');

  await actionRow(page, 'light').getByRole('button', { name: 'Edit Lamp' }).click();
  await page
    .getByRole('dialog', { name: 'Edit action' })
    .getByRole('button', { name: 'Remove' })
    .click();
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Remove Lamp?' })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(page.locator('tr[data-action]')).toHaveCount(9);

  // The row removes too, behind the same question.
  await actionRow(page, 'pause').getByRole('button', { name: 'Remove Pause' }).click();
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Remove Pause?' })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(page.getByText('8 of 32')).toBeVisible();
});

test('actions are reordered by dragging a row and from the keyboard', async ({ page }) => {
  await openInputs(page);
  expect((await actionNames(page)).slice(0, 4)).toEqual(['left', 'right', 'up', 'down']);

  // Dragged by the cell that holds no control of its own.
  await actionRow(page, 'left')
    .getByRole('cell')
    .first()
    .dragTo(actionRow(page, 'up').getByRole('cell').first());
  await expect
    .poll(async () => (await actionNames(page)).slice(0, 4))
    .toEqual(['right', 'up', 'left', 'down']);

  const row = actionRow(page, 'left').getByRole('button', { name: /^Left/ });
  await row.focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect
    .poll(async () => (await actionNames(page)).slice(0, 4))
    .toEqual(['right', 'left', 'up', 'down']);
  // The focus moved with the row, so the next press moves the same action.
  await expect(row).toBeFocused();
  await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('Alt+ArrowDown');
  await expect
    .poll(async () => (await actionNames(page)).slice(0, 4))
    .toEqual(['right', 'up', 'down', 'left']);
});

test('an input is plugged by a key and by a gamepad button, and a key changes player', async ({
  page,
}) => {
  await plugTestPad(page);
  await openInputs(page);
  await actionRow(page, 'pause')
    .getByRole('button', { name: /^Pause/ })
    .click();
  const inputs = page.locator('tbody tr').filter({ has: page.locator('nc-input-cap') });
  await expect(inputs).toHaveCount(4);

  await page.getByRole('button', { name: 'Plug an input' }).click();
  await expect(page.getByRole('status')).toHaveText('Press a key or a gamepad button');
  await page.keyboard.press('Escape');
  // The focus comes back to where the capture was started from.
  await expect(page.getByRole('button', { name: 'Plug an input' })).toBeFocused();
  await expect(inputs).toHaveCount(4);

  await page.getByRole('button', { name: 'Plug an input' }).click();
  await page.keyboard.press('g');
  await expect(inputs).toHaveCount(5);
  // A key lands on the first player's keyboard, which the row lets its author change.
  const plugged = inputs.last();
  await expect(plugged).toContainText('g');
  await expect(plugged).toContainText('Keyboard');
  await plugged.getByRole('button', { name: 'Player 1, switch to player 2' }).click();
  await expect(
    inputs.last().getByRole('button', { name: 'Player 2, switch to player 1' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Plug an input' }).click();
  await holdPadButton(page, RIGHT_BUMPER);
  await expect(inputs).toHaveCount(6);
  await expect(inputs.last()).toContainText('RB');
  await expect(inputs.last()).toContainText('Gamepad');
  await holdPadButton(page, null);

  await inputs.last().getByRole('button', { name: 'Unplug' }).click();
  await expect(inputs).toHaveCount(5);
});

test('an input another action holds is moved, kept on both, or left alone', async ({ page }) => {
  await openInputs(page);
  const open = (name: string, label: RegExp): Promise<void> =>
    actionRow(page, name).getByRole('button', { name: label }).click();
  const inputs = page.locator('tbody tr').filter({ has: page.locator('nc-input-cap') });
  const clash = page.getByRole('group', { name: 'Already plugged into Left' });

  await open('a', /^A a/);
  await expect(inputs).toHaveCount(4);
  await page.getByRole('button', { name: 'Plug an input' }).click();
  await page.keyboard.press('ArrowLeft');
  await expect(clash).toBeVisible();
  await clash.getByRole('button', { name: 'Cancel' }).click();
  await expect(inputs).toHaveCount(4);

  await page.getByRole('button', { name: 'Plug an input' }).click();
  await page.keyboard.press('ArrowLeft');
  await clash.getByRole('button', { name: 'Keep on both' }).click();
  await expect(inputs).toHaveCount(5);
  await open('left', /^Left/);
  await expect(inputs).toHaveCount(6);

  await open('b', /^B b/);
  await expect(inputs).toHaveCount(4);
  await page.getByRole('button', { name: 'Plug an input' }).click();
  await page.keyboard.press('ArrowLeft');
  await page
    .getByRole('group', { name: 'Already plugged into Left and A' })
    .getByRole('button', { name: 'Move it here' })
    .click();
  await expect(inputs).toHaveCount(5);
  await open('left', /^Left/);
  await expect(inputs).toHaveCount(5);
});

/**
 * The actions live in the document, not in the tab: leaving for CODE tears the page down, and the
 * preset is still applied on the way back. Asserted in one page load because the mock holds the
 * document in the page only.
 */
test('a preset replaces the actions in the document, behind a confirmation', async ({ page }) => {
  await openInputs(page);
  await page.getByRole('button', { name: 'Presets' }).click();
  const presets = page.getByRole('region', { name: 'Presets' });
  await expect(presets.getByRole('button')).toHaveCount(4);
  await presets.getByRole('button', { name: /^Platformer/ }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText('Replace every action with Platformer?');
  await expect(confirm).toContainText('The code is not rewritten');
  await confirm.getByRole('button', { name: 'Replace the actions' }).click();
  await expect(page.locator('tr[data-action]')).toHaveCount(7);
  expect(await actionNames(page)).toContain('jump');

  await page.locator('nc-rail').getByRole('button', { name: 'Code' }).click();
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await page.locator('nc-rail').getByRole('button', { name: 'Game' }).click();
  await expect(page.getByRole('tab', { name: /Inputs/ })).toContainText('7');
});

/**
 * The game is started before the preset is applied and never restarted: it reads the new actions
 * because the engine follows the document, not because it loaded them.
 */
test('a preset applied in the GAME tab is what the running game reads', async ({ page }) => {
  await seedGame(page);
  await page.goto(editorUrl('code'));
  await page.getByRole('tab', { name: 'main', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Play' }).first().click();
  // A key is read at the next step, so it is held for longer than one.
  const tapSpace = async (): Promise<void> => {
    await page.locator('nc-game-screen canvas').first().click();
    await page.keyboard.down('Space');
    await page.waitForTimeout(100);
    await page.keyboard.up('Space');
  };
  const said = (line: string): Locator => page.locator('nc-console-column').getByText(line);
  await tapSpace();
  await expect(said('pressed a')).toHaveCount(1);
  await expect(said('jumped')).toHaveCount(0);

  await page.locator('nc-rail').getByRole('button', { name: 'Game' }).click();
  await page.getByRole('tab', { name: 'Inputs' }).click();
  await page.getByRole('button', { name: 'Presets' }).click();
  await page
    .getByRole('region', { name: 'Presets' })
    .getByRole('button', { name: /^Platformer/ })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Replace the actions' }).click();
  await expect(page.locator('tr[data-action]')).toHaveCount(7);

  await page.locator('nc-rail').getByRole('button', { name: 'Code' }).click();
  await tapSpace();
  await expect(said('jumped')).toHaveCount(1);
  await expect(said('pressed a')).toHaveCount(1);
});

test('the touch pad preview draws the controls in use and names the ones it has no place for', async ({
  page,
}) => {
  await plugTestPad(page);
  await openInputs(page);
  await page.getByRole('button', { name: 'Touch pad' }).click();
  const preview = page.getByRole('region', { name: 'Touch pad' });
  await expect(preview.getByText('9 of 9')).toBeVisible();
  await expect(preview.locator('[data-nc-control]')).toHaveCount(9);

  await page.getByRole('button', { name: 'Presets' }).click();
  await page
    .getByRole('region', { name: 'Presets' })
    .getByRole('button', { name: /^Two players/ })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Replace the actions' }).click();
  await page.getByRole('button', { name: 'Touch pad' }).click();
  // Two players: the cross, A and Start, and nothing for B, X or Y.
  await expect(preview.getByText('6 of 9')).toBeVisible();
  await expect(preview.locator('[data-nc-control]')).toHaveCount(6);
  await expect(preview.locator('[data-nc-control="b"]')).toHaveCount(0);

  // A bumper is a control the on-screen pad does not have.
  await page.getByRole('button', { name: 'Touch pad' }).click();
  await actionRow(page, 'action')
    .getByRole('button', { name: /^Action/ })
    .click();
  await page.getByRole('button', { name: 'Plug an input' }).click();
  await holdPadButton(page, RIGHT_BUMPER);
  await expect(page.locator('tbody nc-input-cap').last()).toContainText('RB');
  await holdPadButton(page, null);
  await page.getByRole('button', { name: 'Touch pad' }).click();
  await expect(preview.getByText('RB is not on the pad')).toBeVisible();
});

test('a collaborator is shown with their picture, not their initial', async ({ page }) => {
  await page.goto(editorUrl('game'));
  await page.getByRole('button', { name: /share/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'priax' }).locator('img')).toBeVisible();
});

test('an autosave is deleted from the versions panel', async ({ page }) => {
  // Two of them, because the newest row is the one the game currently is and offers nothing to do
  // to itself. The beforeEach's mock answers with an empty list, so this route goes on top of it.
  let saves = [
    { name: 'save-2', date: '2026-09-11T09:00:00.000Z' },
    { name: 'save-1', date: '2026-09-11T08:00:00.000Z' },
  ];
  await page.route(projectRoute('versions'), (route) =>
    route.fulfill({ json: { versions: saves } }),
  );
  const deletes: string[] = [];
  await page.route(projectRoute('versions/*'), (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    deletes.push(name);
    saves = saves.filter((save) => save.name !== name);
    return route.fulfill({ json: { message: 'Version deleted successfully', name } });
  });

  await page.goto(editorUrl('game'));
  const chip = versionsChip(page);
  // The chip names the newest named version, and this project has none: an autosave coming or
  // going is not something it can show, so it reads the same before and after the delete.
  await expect(chip).toContainText('draft');
  await chip.click();
  const rows = page.locator('nc-popover-panel li', { hasText: 'Autosave' });
  await expect(rows).toHaveCount(2);

  const remove = rows.nth(1).getByRole('button', { name: 'Delete this autosave' });

  // Escape and Cancel are a no: the API is not called and the row stays.
  await remove.click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Delete this version?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await remove.click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(deletes).toEqual([]);
  await expect(rows).toHaveCount(2);

  await remove.click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(rows).toHaveCount(1);
  expect(deletes).toEqual(['save-1']);
  await expect(chip).toHaveText(/^\s*Platformer\s+draft\s*$/);
});

test('restoring a version asks first, and Cancel never reads it', async ({ page }) => {
  const releases = [
    { name: 'alpha', date: '2026-09-11T09:00:00.000Z' },
    { name: 'beta', date: '2026-09-11T08:00:00.000Z' },
  ];
  await page.route(projectRoute('checkpoints'), (route) =>
    route.fulfill({ json: { checkpoints: releases } }),
  );
  const reads: string[] = [];
  await page.route(projectRoute('checkpoints/*'), (route) => {
    reads.push(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    return route.fulfill({ status: 404, json: { message: 'Not found' } });
  });

  await page.goto(editorUrl('game'));
  await versionsChip(page).click();
  const restore = page
    .locator('nc-popover-panel li', { hasText: 'beta' })
    .getByRole('button', { name: 'Restore this release' });
  const dialog = page.getByRole('dialog').filter({ hasText: 'Restore this version?' });

  await restore.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await restore.click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(reads).toEqual([]);

  await restore.click();
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect.poll(() => reads).toEqual(['beta']);
});

test('a pause in the typing is what saves the game', async ({ page }) => {
  let saves = 0;
  await mockEditor(page, {
    onSave: () => {
      saves += 1;
    },
  });

  await page.goto(editorUrl('game'));
  const name = page.getByRole('textbox', { name: 'Name' });
  await expect(name).toHaveValue('Platformer');
  // Opening a session as its host writes the document out once. Waited for rather than assumed,
  // so the count below is taken with that one already through.
  await expect.poll(() => saves, { timeout: 15_000 }).toBeGreaterThan(0);
  const opened = saves;
  await name.fill('Platformer II');

  // Nothing else is done to the page: the pause is the whole trigger. The five-minute interval
  // could not have fired in the time this waits.
  await expect.poll(() => saves, { timeout: 15_000 }).toBe(opened + 1);
});

/**
 * The host's one job is the autosave. Publishing and naming a version are a click, and a click is
 * one write whoever makes it — so a collaborator in a room somebody else hosts has both buttons,
 * and naming a version writes the document out once, from that click and from nothing else.
 */
test('a collaborator who is not the host may publish and name a version', async ({ page }) => {
  let saves = 0;
  await mockEditor(page, {
    hostId: uuidOf(4),
    onSave: () => {
      saves += 1;
    },
  });
  await page.route(projectRoute('checkpoints/*'), (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 201, json: { message: 'Checkpoint saved' } })
      : route.fallback(),
  );

  await page.goto(editorUrl('game'));
  const name = page.getByRole('textbox', { name: 'Name' });
  await expect(name).toHaveValue('Platformer');
  await expect(page.getByRole('button', { name: /^publish$/i })).toBeEnabled();
  // A guest opens without writing anything out, and an edit makes the state worth naming.
  expect(saves).toBe(0);
  await name.fill('Platformer II');

  await versionsChip(page).click();
  await page.locator('nc-popover-panel').getByRole('button', { name: 'Save a version' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save a version' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('v1');
  const save = dialog.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText('Saved version "v1"')).toBeVisible();
  expect(saves).toBe(1);
});

/**
 * The cap is said before the save is refused, and the way through it is said with it: a name the
 * list already holds rewrites that version and does not count.
 */
test('the cap on named versions is explained before the save is refused', async ({ page }) => {
  await mockEditor(page, {
    maxCheckpoints: 1,
    checkpoints: [{ name: 'v1', date: '2026-09-11T09:00:00.000Z' }],
  });

  await page.goto(editorUrl('game'));
  await versionsChip(page).click();
  await page.locator('nc-popover-panel').getByRole('button', { name: 'Save a version' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save a version' });
  await expect(dialog.getByText('1 of 1 named versions')).toBeVisible();
  await expect(dialog.getByText('1 versions out of 1')).toBeVisible();
  const save = dialog.getByRole('button', { name: 'Save', exact: true });

  const name = dialog.getByRole('textbox', { name: 'Name' });
  await name.fill('v2');
  await expect(save).toBeDisabled();
  await name.fill('v1');
  await expect(dialog.getByText('Overwrites the version "v1"')).toBeVisible();
  await expect(save).toBeEnabled();
});
