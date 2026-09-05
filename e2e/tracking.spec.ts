import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { prepareApp } from './screens';

const SCREENS = JSON.parse(readFileSync('tools/design-screens.json', 'utf8')) as {
  screens: { id: string; url: string; waitFor: string }[];
};

const TOLERANCE = 0.02;

test('every element draws the tracking it asks for', async ({ page }) => {
  await prepareApp(page);

  for (const screen of SCREENS.screens) {
    await page.goto(screen.url, { waitUntil: 'networkidle' });
    await page.waitForSelector(screen.waitFor);

    const wrong = await page.evaluate((tolerance) => {
      const found: string[] = [];
      for (const node of document.querySelectorAll('*')) {
        const draws = [...node.childNodes].some(
          (child) => child.nodeType === 3 && child.textContent?.trim(),
        );
        if (!draws) continue;

        const style = getComputedStyle(node);
        const asked = style.getPropertyValue('--nc-tracking').trim();
        const drawn = style.letterSpacing;
        const where = `${node.tagName} "${node.textContent?.trim().slice(0, 18)}"`;

        if (asked === 'normal' || asked === '') {
          if (drawn !== 'normal')
            found.push(`${where}: asked ${asked || 'nothing'}, drew ${drawn}`);
          continue;
        }
        if (!asked.endsWith('em')) continue;
        const want = parseFloat(asked) * parseFloat(style.fontSize);
        if (Math.abs(parseFloat(drawn) - want) > tolerance) {
          found.push(
            `${where}: asked ${asked} at ${style.fontSize} = ${String(want)}px, drew ${drawn}`,
          );
        }
      }
      return found;
    }, TOLERANCE);

    expect(wrong, `on ${screen.id}`).toEqual([]);
  }
});
