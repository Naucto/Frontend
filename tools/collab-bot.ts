import { chromium, type Locator, type Page } from '@playwright/test';

import { getEnv, getOptionalEnv } from './env';

const BASE = getOptionalEnv('NAUCTO_BOT_URL', 'http://localhost:3001');
const PROJECT = getEnv('NAUCTO_BOT_PROJECT');
const EMAIL = getOptionalEnv('NAUCTO_BOT_EMAIL', 'louis@naucto.local');
const PASSWORD = getOptionalEnv('NAUCTO_BOT_PASSWORD') ?? getEnv('NAUCTO_SEED_PASSWORD');
const ROUNDS = getOptionalEnv('NAUCTO_BOT_ROUNDS', 0);
const HEADED = getOptionalEnv('NAUCTO_BOT_HEADED', false);
const UNDO = getOptionalEnv('NAUCTO_BOT_UNDO', true);

const KEY_GUTTER = 56;
const STEP_W = 24;
const UNDO_CAP = 500;

let edits = 0;
let stopping = false;

const log = (text: string): void => {
  console.log(`[${new Date().toLocaleTimeString()}] ${text}`);
};

const pause = (page: Page, ms: number): Promise<void> =>
  page.waitForTimeout(ms * (0.7 + Math.random() * 0.6));

const pick = <T>(list: readonly T[]): T => {
  const item = list[Math.floor(Math.random() * list.length)];
  if (item === undefined) {
    throw new Error('nothing to pick from');
  }
  return item;
};

async function boxOf(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('not on screen');
  }
  return box;
}

async function glide(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y, { steps: 18 });
}

async function wander(page: Page, area: Locator, moves: number): Promise<void> {
  const box = await boxOf(area);
  for (let i = 0; i < moves && !stopping; i++) {
    await glide(
      page,
      box.x + box.width * (0.15 + Math.random() * 0.7),
      box.y + box.height * (0.2 + Math.random() * 0.6),
    );
    await pause(page, 350);
  }
}

const tab = (page: Page, name: string): Locator =>
  page.getByRole('tab', { name: new RegExp(`^${name}`) }).first();

async function openTab(page: Page, name: string): Promise<void> {
  const target = tab(page, name);
  const box = await boxOf(target);
  await glide(page, box.x + box.width / 2, box.y + box.height / 2);
  await target.click();
  await pause(page, 600);
}

async function signIn(page: Page): Promise<void> {
  log(`signing in as ${EMAIL}`);
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 60_000 });
  const refuse = page.getByRole('button', { name: 'Refuse', exact: true });
  if (await refuse.isVisible().catch(() => false)) {
    await refuse.click();
  }
}

async function ensureInstrument(page: Page): Promise<void> {
  const rows = page.getByRole('list', { name: 'Instruments' }).first().getByRole('listitem');
  if ((await rows.count()) > 0) {
    return;
  }
  log('no instrument yet: adding one');
  await page.getByRole('button', { name: 'Add instrument' }).first().click();
  await page
    .getByRole('dialog', { name: 'New instrument' })
    .getByRole('button', { name: 'Custom' })
    .click();
  edits += 1;
  await pause(page, 600);
}

async function playPatterns(page: Page): Promise<void> {
  log('Patterns: writing notes');
  await openTab(page, 'Patterns');
  await ensureInstrument(page);
  const view = page.locator('nc-piano-roll').first();
  const box = await boxOf(view);
  await wander(page, view, 3);
  const top = box.y + box.height * 0.35;
  const placed: { x: number; y: number }[] = [];
  for (let i = 0; i < 4 && !stopping; i++) {
    const x = box.x + KEY_GUTTER + STEP_W * (2 + Math.floor(Math.random() * 12)) + STEP_W / 2;
    const y = top + Math.floor(Math.random() * 10) * 20 + 10;
    await glide(page, x, y);
    await page.mouse.down();
    await page.mouse.move(x + STEP_W * (1 + Math.floor(Math.random() * 3)), y, { steps: 6 });
    await page.mouse.up();
    placed.push({ x, y });
    edits += 1;
    await pause(page, 700);
  }
  const moved = placed[0];
  if (moved && !stopping) {
    await glide(page, moved.x, moved.y);
    await page.mouse.down();
    await page.mouse.move(moved.x + STEP_W * 2, moved.y - 40, { steps: 12 });
    await page.mouse.up();
    edits += 1;
    await pause(page, 700);
  }
  const removed = placed[placed.length - 1];
  if (removed && !stopping) {
    await glide(page, removed.x, removed.y);
    await page.mouse.click(removed.x, removed.y, { button: 'right' });
    edits += 1;
    await pause(page, 600);
  }
}

async function playTimeline(page: Page): Promise<void> {
  log('Timeline: placing and moving blocks');
  await openTab(page, 'Timeline');
  const lane = page.locator('[data-lane]').first();
  const rows = page.getByRole('list', { name: 'Patterns' }).first().getByRole('listitem');
  const count = await rows.count();
  if (count === 0) {
    log('Timeline: no pattern to place yet');
    return;
  }
  const laneBox = await boxOf(lane);
  for (let i = 0; i < 2 && !stopping; i++) {
    const row = rows.nth(Math.floor(Math.random() * Math.min(count, 4)));
    const from = await boxOf(row);
    await glide(page, from.x + 40, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(laneBox.x + 30 + Math.random() * 500, laneBox.y + laneBox.height / 2, {
      steps: 24,
    });
    await page.mouse.up();
    edits += 1;
    await pause(page, 800);
  }
  const blocks = page.locator('[data-block]');
  const total = await blocks.count();
  if (total === 0 || stopping) {
    return;
  }
  const first = await boxOf(blocks.nth(Math.floor(Math.random() * total)));
  await glide(page, first.x + 10, first.y + first.height / 2);
  await page.mouse.click(first.x + 10, first.y + first.height / 2);
  await pause(page, 600);
  if (total > 1) {
    const second = await boxOf(blocks.nth((Math.floor(Math.random() * total) + 1) % total));
    await glide(page, second.x + 10, second.y + second.height / 2);
    await page.keyboard.down('Shift');
    await page.mouse.click(second.x + 10, second.y + second.height / 2);
    await page.keyboard.up('Shift');
    await pause(page, 1200);
  }
  await page.mouse.move(first.x + 10, first.y + first.height / 2, { steps: 10 });
  await page.mouse.down();
  await page.mouse.move(first.x + 10 + pick([-1, 1, 2]) * 56, first.y + first.height / 2, {
    steps: 16,
  });
  await page.mouse.up();
  edits += 1;
  await pause(page, 900);
  await wander(page, lane, 3);
  const last = blocks.nth((await blocks.count()) - 1);
  const lastBox = await boxOf(last);
  await glide(page, lastBox.x + 10, lastBox.y + lastBox.height / 2);
  await page.mouse.click(lastBox.x + 10, lastBox.y + lastBox.height / 2);
  await page.keyboard.press('Delete');
  edits += 1;
  await pause(page, 700);
}

async function playInstruments(page: Page): Promise<void> {
  log('Instruments: tuning');
  await openTab(page, 'Instruments');
  const editor = page.locator('nc-instrument-editor').first();
  if (!(await editor.isVisible())) {
    return;
  }
  const rows = editor.getByRole('list', { name: 'Instruments' }).getByRole('listitem');
  const count = await rows.count();
  if (count > 0) {
    const row = rows.nth(Math.floor(Math.random() * Math.min(count, 6)));
    const box = await boxOf(row);
    await glide(page, box.x + 60, box.y + box.height / 2);
    await row.click({ position: { x: 60, y: box.height / 2 } });
    await pause(page, 900);
  }
  await wander(page, editor, 4);
  const slider = page.locator('nc-instrument-inspector input[type="range"]').first();
  if (await slider.isVisible()) {
    const box = await boxOf(slider);
    await glide(page, box.x + box.width * 0.3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * (0.3 + Math.random() * 0.5), box.y + box.height / 2, {
      steps: 14,
    });
    await page.mouse.up();
    edits += 1;
  }
  await pause(page, 700);
}

async function undoMine(page: Page): Promise<void> {
  const undo = page.getByRole('button', { name: 'Undo' }).first();
  let undone = 0;
  while (undone < UNDO_CAP && (await undo.isEnabled().catch(() => false))) {
    await undo.click();
    undone += 1;
    await page.waitForTimeout(60);
  }
  log(`undid ${String(undone)} step(s) for ${String(edits)} gesture(s) of the bot`);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage({ viewport: { width: 1600, height: 960 } });
  process.on('SIGINT', () => {
    if (stopping) {
      process.exit(1);
    }
    log('stopping after this step (Ctrl+C again to quit at once)');
    stopping = true;
  });
  try {
    await signIn(page);
    log(`opening project ${String(PROJECT)}`);
    await page.goto(`${BASE}/edit/${String(PROJECT)}/sound`);
    await page
      .getByRole('tab', { name: /^Patterns/ })
      .first()
      .waitFor({ timeout: 60_000 });
    log('in the session: stop with Ctrl+C');
    const steps = [playPatterns, playTimeline, playInstruments];
    for (let round = 0; (ROUNDS === 0 || round < ROUNDS) && !stopping; round++) {
      for (const step of steps) {
        if (stopping) {
          break;
        }
        await step(page);
      }
    }
    if (UNDO) {
      await openTab(page, 'Patterns');
      await undoMine(page);
    }
  } catch (error) {
    log(`stopped: ${error instanceof Error ? error.message : String(error)}`);
    await page.screenshot({ path: 'test-results/collab-bot-error.png' }).catch(() => undefined);
    process.exitCode = 1;
  } finally {
    await page.waitForTimeout(500);
    await browser.close();
  }
}

await main();
