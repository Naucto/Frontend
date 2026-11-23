import { uuidOf } from '../packages/api-client/testing';
import { editorUrl, mockEditor, PROJECT_ID } from './editor-mocks';
import { expect, test } from './fixtures';
import { mockHub } from './mocks/hub';
import { mockSignedIn } from './mocks/session';

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

const ROUTES = ['/hub', '/learn', '/friends', '/sign-in', '/u/nobody', '/collections'] as const;

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} (${String(vp.width)}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of ROUTES) {
      test(`${route} does not scroll sideways`, async ({ page }) => {
        await mockHub(page);
        await page.goto(route);
        // Wait for the shell rather than networkidle: several of these pages poll.
        await page.locator('body').waitFor();
        if (route === '/hub') {
          await page.locator('nc-collection-box').waitFor();
        }
        const overflow = await page.evaluate(() => {
          const documentElement = document.documentElement;
          return {
            scrollWidth: documentElement.scrollWidth,
            clientWidth: documentElement.clientWidth,
          };
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
   * The narrow-window notice sits behind the editor's guard, so a signed-out phone must land on
   * sign-in, never a 404.
   */
  test('a phone keeps its way into the editor, and is not 404ed out of it', async ({ page }) => {
    await page.goto(`/edit/${uuidOf(1)}`);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=%2Fedit%2F${uuidOf(1)}`));
    await expect(page.getByRole('heading', { name: /insert game/i })).toBeVisible();
  });

  test('the notice that stands for the editor keeps its words and its link inside the screen', async ({
    page,
  }) => {
    await mockEditor(page);
    await page.goto(editorUrl('game'));

    const notice = page.locator('nc-open-on-desktop');
    await expect(
      notice.getByRole('heading', { name: 'The editor needs a bigger screen' }),
    ).toBeVisible();
    const pieces = [
      notice.locator('p'),
      notice.locator('span', { hasText: `/edit/${PROJECT_ID}` }),
      notice.getByRole('button', { name: 'Copy link' }),
      notice.getByRole('link', { name: 'Play it instead' }),
      notice.getByRole('link', { name: 'Back to the hub' }),
    ];
    for (const piece of pieces) {
      const box = await piece.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    }
  });
});

/** A signed-in bar is the full one: on a tablet the search keeps room to type a few words in. */
const BARS = [
  { width: 768, least: 160 },
  { width: 900, least: 240 },
  { width: 1100, least: 240 },
  { width: 1280, least: 240 },
] as const;

for (const { width, least } of BARS) {
  test.describe(`top bar search (${String(width)}px)`, () => {
    test.use({ viewport: { width, height: 800 } });

    test('sits clear of both clusters and keeps a usable width', async ({ page }) => {
      await mockSignedIn(page);
      await page.goto('/hub');
      await expect(page.getByRole('link', { name: /new game/i })).toBeVisible();

      const nav = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox();
      const search = await page.locator('nc-search-suggest').boundingBox();
      const actions = await page.getByTestId('top-bar-actions').boundingBox();
      if (!nav || !search || !actions) {
        throw new Error('top bar is not laid out');
      }

      expect(nav.x + nav.width).toBeLessThanOrEqual(search.x);
      expect(search.x + search.width).toBeLessThanOrEqual(actions.x);
      expect(search.width).toBeGreaterThanOrEqual(least);
    });

    /** The panel is as wide as three disks need even where the box is not, and stays on screen. */
    test('drops a panel that keeps its width and stays inside the window', async ({ page }) => {
      await mockSignedIn(page);
      await page.goto('/hub');

      await page.getByRole('combobox', { name: 'Search games, people, tags…' }).click();
      const panel = await page.locator('nc-suggest-panel').boundingBox();
      if (!panel) {
        throw new Error('the search panel is not laid out');
      }

      // Under a box of odd width the panel's edges fall on half pixels, which the engine keeps in
      // 64ths: the width comes back a 64th short.
      expect(Math.round(panel.width)).toBeGreaterThanOrEqual(480);
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(width);
    });
  });
}

/** The ART header's tool group stays clear of its toggles on a laptop. */
for (const width of [1280, 1440]) {
  test.describe(`ART header (${String(width)}px)`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('keeps every tool clear of the toggles', async ({ page }) => {
      await mockEditor(page);
      await page.goto(editorUrl('art'));
      const tools = page.getByRole('radiogroup', { name: 'Tools' });
      await expect(tools.getByRole('radio', { name: 'Move' })).toBeVisible();
      const lock = page.getByRole('switch', { name: 'Lock' });
      const [group, toggle] = await Promise.all([tools.boundingBox(), lock.boundingBox()]);
      if (!group || !toggle) {
        throw new Error('header off screen');
      }
      expect(group.x + group.width).toBeLessThanOrEqual(toggle.x);
    });
  });
}

/**
 * The SOUND bar's fields keep their names inside their window from the editor's floor width up.
 */
for (const width of [1024, 1152, 1280, 1440, 1920]) {
  test.describe(`SOUND header (${String(width)}px)`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('keeps the BPM field, with its name, inside the Patterns window', async ({ page }) => {
      await mockEditor(page);
      await page.goto(editorUrl('sound'));
      await page.getByRole('button', { name: 'Add instrument' }).first().click();
      await page
        .getByRole('dialog', { name: 'New instrument' })
        .getByRole('button', { name: 'Custom' })
        .click();
      const bpm = page.getByRole('textbox', { name: 'BPM' });
      await expect(bpm).toBeVisible();
      const box = bpm.locator('xpath=ancestor::nc-number-field');
      await expect(box.getByText('BPM', { exact: true })).toBeVisible();
      const [field, bar] = await Promise.all([
        box.boundingBox(),
        page.locator('nc-note-sheet-editor').boundingBox(),
      ]);
      if (!field || !bar) {
        throw new Error('header off screen');
      }
      expect(field.x + field.width).toBeLessThanOrEqual(bar.x + bar.width);
      expect(field.y + field.height).toBeLessThanOrEqual(bar.y + bar.height);
    });
  });
}
