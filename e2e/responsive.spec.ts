import { mockEditor } from './editor-mocks';
import { expect, type Page, test } from './fixtures';

/**
 * The design's 1920 and 1400 frames simulate one screen size; they are not a maximum. Every
 * non-gated page has to survive from a phone to an ultrawide without the document scrolling
 * sideways — a horizontal scrollbar on the body is the single symptom that catches almost every
 * fixed width left in a layout.
 */
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'ultrawide', width: 2560, height: 1440 },
] as const;

const ROUTES = ['/hub', '/learn', '/friends', '/sign-in', '/u/nobody'] as const;

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} (${String(vp.width)}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of ROUTES) {
      test(`${route} does not scroll sideways`, async ({ page }) => {
        await page.goto(route);
        // Wait for the shell rather than networkidle: several of these pages poll.
        await page.locator('body').waitFor();
        const overflow = await page.evaluate(() => {
          const d = document.documentElement;
          return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth };
        });
        // One pixel of slack for sub-pixel rounding on fractional scale factors.
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
      });
    }
  });
}

test.describe('editor gate', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /**
   * Sign-in is what this asserts because the narrow-window notice is a state of the editor, reached
   * through the editor's own route and so behind its guard. What matters is the thing that must
   * never happen: a phone opening a link to a game being told the game does not exist.
   */
  test('a phone keeps its way into the editor, and is not 404ed out of it', async ({ page }) => {
    await page.goto('/edit/1');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fedit%2F1/);
    await expect(page.getByRole('heading', { name: /insert game/i })).toBeVisible();
  });
});

/**
 * Signed in, because that is the bar at its widest: four nav links on one side, NEW GAME, the bell
 * and the account on the other. The search sits between them and has to give way before either
 * cluster does — at these widths it used to be centred on the window and run under the nav.
 */
async function signIn(page: Page): Promise<void> {
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
}

for (const width of [1100, 1280]) {
  test.describe(`top bar search (${String(width)}px)`, () => {
    test.use({ viewport: { width, height: 800 } });

    test('sits clear of both clusters and keeps a usable width', async ({ page }) => {
      await signIn(page);
      await page.goto('/hub');
      await expect(page.getByRole('link', { name: /new game/i })).toBeVisible();

      const nav = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox();
      const search = await page.locator('nc-search-suggest').boundingBox();
      const actions = await page.getByTestId('top-bar-actions').boundingBox();
      if (!nav || !search || !actions) throw new Error('top bar is not laid out');

      expect(nav.x + nav.width).toBeLessThanOrEqual(search.x);
      expect(search.x + search.width).toBeLessThanOrEqual(actions.x);
      expect(search.width).toBeGreaterThanOrEqual(240);
    });
  });
}

/**
 * The ART header holds eight tools between a title and six controls. On a laptop the right-hand
 * group used to spill over the tool group and hide Pick and Move under LOCK.
 */
for (const width of [1280, 1440]) {
  test.describe(`ART header (${String(width)}px)`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('keeps every tool clear of the toggles', async ({ page }) => {
      await mockEditor(page);
      await page.goto('/edit/7/art');
      const tools = page.getByRole('radiogroup', { name: 'Tools' });
      await expect(tools.getByRole('radio', { name: 'Move' })).toBeVisible();
      const lock = page.getByRole('switch', { name: 'Lock' });
      const [group, toggle] = await Promise.all([tools.boundingBox(), lock.boundingBox()]);
      if (!group || !toggle) throw new Error('header off screen');
      expect(group.x + group.width).toBeLessThanOrEqual(toggle.x);
    });
  });
}

/**
 * The SOUND header sits in the roll column, which is what the instrument list and the inspector
 * leave of the window. On a laptop its captions used to push the last fields past the column's
 * edge, into a scroll nobody saw. 1920 is where the captions come back, and has to hold them.
 */
for (const width of [1280, 1440, 1920]) {
  test.describe(`SOUND header (${String(width)}px)`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('keeps the STEPS field inside the roll column', async ({ page }) => {
      await mockEditor(page);
      await page.goto('/edit/7/sound');
      await page.getByRole('button', { name: 'Add instrument' }).first().click();
      await page
        .getByRole('dialog', { name: 'New instrument' })
        .getByRole('button', { name: 'Custom' })
        .click();
      const steps = page.getByRole('textbox', { name: 'Steps' });
      await expect(steps).toBeVisible();
      const [field, bar] = await Promise.all([
        steps.locator('xpath=ancestor::nc-number-field').boundingBox(),
        steps.locator('xpath=ancestor::header').boundingBox(),
      ]);
      if (!field || !bar) throw new Error('header off screen');
      expect(field.x + field.width).toBeLessThanOrEqual(bar.x + bar.width);
    });
  });
}
