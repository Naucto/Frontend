import { mockEditor } from './editor-mocks';
import { expect, test } from './fixtures';

test.use({ viewport: { width: 1920, height: 1030 } });

/**
 * The frame rate the starter game holds in the CODE tab's viewer, per browser.
 *
 * A frame-path change is judged against this number before and after, which is why the samples are
 * attached rather than reduced to a verdict. Only Chromium is held to a floor: the Firefox project
 * runs this spec alone, to be read, because what it gives depends more on the engine underneath it
 * than on the code under test.
 */
test('the starter game holds its frame rate', async ({ page }) => {
  // A number, not a verdict: on a shared runner the GPU is software and the clock is somebody
  // else's, so the reading says nothing about the code. It is taken on a machine, by hand.
  test.skip(!!process.env.CI, 'a frame rate is measured locally, not on a shared runner');
  await mockEditor(page);
  await page.goto('/edit/7/code');
  // Opening the editor mounts the game but does not start it; AUTO-RUN, on by default, only starts
  // it when it is switched, and the play overlay goes through the same `runtime.play()`.
  await page.getByRole('button', { name: 'Play' }).first().click();

  // The viewer prints `host.fps()` every 250 ms, a mean over the engine's last 60 presents, so
  // that readout is the frame rate as a player sees it; nothing is added to the page to expose it.
  const readout = page.locator('nc-game-screen').getByText(/\d+ FPS/);
  const fps = async (): Promise<number> =>
    Number(/(\d+) FPS/.exec(await readout.innerText())?.[1] ?? NaN);

  // The rolling mean starts from the first present, so the first readings average the frames that
  // shared their second with the Lua VM booting; let the window fill before it counts.
  await expect.poll(fps).toBeGreaterThan(0);
  await page.waitForTimeout(1_000);

  const samples: number[] = [];
  while (samples.length < 20) {
    samples.push(await fps());
    await page.waitForTimeout(250);
  }
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const browser = test.info().project.name;

  await test.info().attach('fps', {
    body: JSON.stringify({ browser, mean, samples }, null, 2),
    contentType: 'application/json',
  });
  if (browser === 'chromium') expect(mean).toBeGreaterThanOrEqual(55);
});
