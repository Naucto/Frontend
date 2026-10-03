import { getOptionalEnv } from '../tools/env';
import { editorUrl, mockEditor } from './editor-mocks';
import { expect, test } from './fixtures';

test.use({ viewport: { width: 1920, height: 1030 } });

/**
 * The starter game's frame rate in the CODE viewer, attached as samples; only Chromium is held to a
 * floor.
 */
test('the starter game holds its frame rate', async ({ page }) => {
  test.skip(
    getOptionalEnv('CI', false),
    'a frame rate is measured locally, not on a shared runner',
  );
  await mockEditor(page);
  await page.goto(editorUrl('code'));
  // Opening the editor mounts the game without starting it.
  await page.getByRole('button', { name: 'Play' }).first().click();

  // The viewer's FPS readout is a rolling mean over the engine's recent presents.
  const readout = page.locator('nc-game-screen').getByText(/\d+ FPS/);
  const fps = async (): Promise<number> =>
    Number(/(\d+) FPS/.exec(await readout.innerText())?.[1] ?? NaN);

  // Early readings include the Lua VM boot; let the averaging window fill first.
  await expect.poll(fps).toBeGreaterThan(0);
  await page.waitForTimeout(1_000);

  const samples: number[] = [];
  while (samples.length < 20) {
    samples.push(await fps());
    await page.waitForTimeout(250);
  }
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const browser = test.info().project.name;

  await test.info().attach('fps', {
    body: JSON.stringify({ browser, mean, samples }, null, 2),
    contentType: 'application/json',
  });
  if (browser === 'chromium') {
    expect(mean).toBeGreaterThanOrEqual(55);
  }
});
