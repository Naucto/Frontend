import { render, type RenderResult, screen, within } from '@testing-library/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMemoryStorage } from '../../testing/memory-storage';
import { testProviders } from '../../testing/providers';
import { PadSettingsStore } from '../game-screen/pad-settings.store';
import { ControlsComponent, padName } from './controls.component';
import { GamepadSeatsStore } from './gamepad-seats.store';

const padOf = (id: string, held: number[] = [], axes = [0, 0, 0, 0]): Gamepad =>
  ({
    id,
    buttons: Array.from({ length: 17 }, (_, button) => ({ pressed: held.includes(button) })),
    axes,
  }) as unknown as Gamepad;

/** What an element says, a space between two pieces that stand apart on screen. */
const text = (element: Element): string => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const pieces: string[] = [];
  while (walker.nextNode()) {
    pieces.push((walker.currentNode.textContent ?? '').replace(/\s+/g, ' ').trim());
  }

  return pieces.filter(Boolean).join(' ');
};

/** The cards of the gamepads, each as the player it names and the pad it holds. */
const cards = (): string[] => [...document.querySelectorAll('article')].map(text);

const lit = (pad: number): (string | null)[] =>
  [...document.querySelectorAll(`[data-pad="${String(pad)}"] [data-lit]`)].map((part) =>
    part.getAttribute('data-part'),
  );

describe('ControlsComponent', () => {
  let pads: (Gamepad | null)[] = [];
  let asked: FrameRequestCallback[] = [];

  /** One more read of the gamepads, as the next frame of a browser gives. */
  const frame = (fixture: { detectChanges: () => void }): void => {
    for (const callback of asked.splice(0)) {
      callback(0);
    }
    fixture.detectChanges();
  };

  const show = (): Promise<RenderResult<ControlsComponent>> =>
    render(ControlsComponent, { providers: testProviders() });

  beforeEach(() => {
    pads = [];
    asked = [];
    installMemoryStorage();
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      return asked.push(callback);
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {
          return undefined;
        }
        disconnect(): void {
          return undefined;
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('invites to press a button while no gamepad is connected', async () => {
    await show();

    expect(screen.getByRole('heading', { name: 'No gamepad connected' })).toBeInTheDocument();
    expect(cards()).toHaveLength(1);
  });

  it('draws a card per gamepad under its player, then the seat the next one takes', async () => {
    pads = [padOf('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)')];
    const { fixture } = await show();

    expect(cards().slice(0, 2)).toEqual([
      'P1 Xbox Wireless Controller',
      'P2 open Press a button on another gamepad to join.',
    ]);

    pads = [pads[0] ?? null, null, padOf('8BitDo SN30 Pro')];
    frame(fixture);
    expect(cards().slice(0, 3)).toEqual([
      'P1 Xbox Wireless Controller',
      'P2 open Press a button on another gamepad to join.',
      'P3 8BitDo SN30 Pro',
    ]);
  });

  it('lights what is held on a gamepad as it is held', async () => {
    pads = [padOf('Pad')];
    const { fixture } = await show();
    expect(lit(0)).toEqual([]);

    pads = [padOf('Pad', [0, 5, 14], [0.9, 0, 0, -0.9])];
    frame(fixture);
    expect(lit(0)).toEqual(['rb', 'dpad-left', 'a', 'ls', 'rs']);

    pads = [padOf('Pad')];
    frame(fixture);
    expect(lit(0)).toEqual([]);
  });

  it('opens the four seats from the badge, and trades with the gamepad that holds one', async () => {
    pads = [padOf('First'), padOf('Second')];
    const { fixture } = await show();

    screen.getByRole('button', { name: 'Plays as player 1' }).click();
    fixture.detectChanges();
    const seats = within(screen.getByRole('menu')).getAllByRole('menuitemradio');
    expect(seats.map(text)).toEqual(['P1 This gamepad', 'P2 Second Swap', 'P3 Free', 'P4 Free']);
    expect(seats[0]).toHaveAttribute('aria-checked', 'true');

    seats[1]?.click();
    fixture.detectChanges();
    expect(fixture.debugElement.injector.get(GamepadSeatsStore).seats()).toEqual([1, 0, 2, 3]);
    expect(cards().slice(0, 2)).toEqual(['P1 Second', 'P2 First']);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves a gamepad to a free seat, which the next gamepad then leaves alone', async () => {
    pads = [padOf('First')];
    const { fixture } = await show();

    screen.getByRole('button', { name: 'Plays as player 1' }).click();
    fixture.detectChanges();
    within(screen.getByRole('menu')).getAllByRole('menuitemradio')[3]?.click();
    fixture.detectChanges();

    expect(cards().slice(0, 2)).toEqual([
      'P2 open Press a button on another gamepad to join.',
      'P4 First',
    ]);
  });

  it('sets the size and the opacity of the on-screen pad, and puts them back', async () => {
    const { fixture } = await show();
    const store = fixture.debugElement.injector.get(PadSettingsStore);
    const reset = screen.getByRole('button', { name: 'Reset' });
    expect(reset).toBeDisabled();

    const size = screen.getByRole('slider', { name: 'Size' });
    (size as HTMLInputElement).value = '120';
    size.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(store.size()).toBe(120);
    expect(reset).toBeEnabled();

    reset.click();
    expect(store.size()).toBe(100);
  });
});

describe('padName', () => {
  it('drops the vendor and product numbers a browser wraps a name in', () => {
    expect(padName('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)')).toBe(
      'Xbox Wireless Controller',
    );
    expect(padName('054c-09cc-Wireless Controller')).toBe('Wireless Controller');
    expect(padName('(Unknown)')).toBe('(Unknown)');
  });
});
