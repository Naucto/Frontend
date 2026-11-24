import type { Page } from '@playwright/test';

/** A gamepad as a spec states it: its name, the standard buttons held and where the sticks are. */
export interface FakePad {
  id: string;
  held?: number[];
  axes?: number[];
}

declare global {
  interface Window {
    ncFakePads?: FakePad[];
  }
}

/**
 * Answers `navigator.getGamepads` with the pads a spec states, index by index. Called before the
 * page loads to install them, and again afterwards to press, let go, plug or unplug.
 */
export async function setGamepads(page: Page, pads: FakePad[]): Promise<void> {
  const install = (stated: FakePad[]): void => {
    window.ncFakePads = stated;
    navigator.getGamepads = () =>
      (window.ncFakePads ?? []).map((pad, index) => ({
        id: pad.id,
        index,
        connected: true,
        mapping: 'standard',
        buttons: Array.from({ length: 17 }, (_, button) => ({
          pressed: (pad.held ?? []).includes(button),
          touched: false,
          value: (pad.held ?? []).includes(button) ? 1 : 0,
        })),
        axes: pad.axes ?? [0, 0, 0, 0],
      })) as unknown as Gamepad[];
  };
  await page.addInitScript(install, pads);
  await page.evaluate(install, pads).catch(() => undefined);
}
