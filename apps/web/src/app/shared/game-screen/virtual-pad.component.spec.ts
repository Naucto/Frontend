import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { TOUCH_CONTROLS, type TouchControl } from '@naucto/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testProviders } from '../../testing/providers';
import { PadSettingsStore } from './pad-settings.store';
import { VirtualPadComponent } from './virtual-pad.component';

function installMemoryStorage(): void {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => mem.get(key) ?? null,
    setItem: (key: string, value: string) => {
      mem.set(key, value);
    },
    removeItem: (key: string) => {
      mem.delete(key);
    },
    clear: () => {
      mem.clear();
    },
  };
}

/** Tells the pad made last how much room it has, as the browser would once it is laid out. */
let giveRoom: (width: number, height: number) => void;

function installResizeObserver(): void {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(
        callback: (entries: { contentRect: { width: number; height: number } }[]) => void,
      ) {
        giveRoom = (width, height) => {
          callback([{ contentRect: { width, height } }]);
        };
      }
      observe(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
}

function pad(
  controls: readonly TouchControl[] = TOUCH_CONTROLS,
): ComponentFixture<VirtualPadComponent> {
  const fixture = TestBed.createComponent(VirtualPadComponent);
  fixture.componentRef.setInput('controls', controls);
  fixture.detectChanges();

  return fixture;
}

const drawn = (fixture: ComponentFixture<VirtualPadComponent>): (string | null)[] =>
  [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-nc-control]')].map((element) =>
    element.getAttribute('data-nc-control'),
  );

describe('VirtualPadComponent', () => {
  beforeEach(() => {
    installMemoryStorage();
    installResizeObserver();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: testProviders() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * The settings panel and the pad have to agree, or the preview is a lie. They agree through one
   * custom property, so this is the join worth pinning.
   */
  it('sizes its keys from the shared pad setting, in whole pixels', () => {
    const fixture = pad();
    const wrap = fixture.nativeElement.firstElementChild as HTMLElement;
    expect(wrap.style.getPropertyValue('--nc-pad-key')).toBe('56px');

    TestBed.inject(PadSettingsStore).setSize(140);
    fixture.detectChanges();
    expect(wrap.style.getPropertyValue('--nc-pad-key')).toBe('78px');
  });

  it('gives a narrow phone smaller keys, so the cross and the diamond stand side by side', () => {
    const fixture = pad();
    TestBed.inject(PadSettingsStore).setSize(140);
    giveRoom(358, 0);
    fixture.detectChanges();

    const wrap = fixture.nativeElement.firstElementChild as HTMLElement;
    expect(wrap.style.getPropertyValue('--nc-pad-key')).toBe('48px');
  });

  it('centres Start on a whole pixel, whatever the room left between the two clusters', () => {
    const fixture = pad();
    const start = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-nc-control="start"]',
    );
    giveRoom(358, 0);
    fixture.detectChanges();
    expect(start?.style.width).toBe('72px');
    expect(start?.style.height).toBe('36px');

    giveRoom(359, 0);
    fixture.detectChanges();
    expect(start?.style.width).toBe('73px');
  });

  it('keeps the overlay inside the height of the screen it lies on', () => {
    const fixture = pad();
    fixture.componentRef.setInput('overlay', true);
    giveRoom(844, 200);
    fixture.detectChanges();

    const wrap = fixture.nativeElement.firstElementChild as HTMLElement;
    expect(wrap.style.getPropertyValue('--nc-pad-key')).toBe('52px');
  });

  it('is drawn smaller than life where it is only shown', () => {
    const fixture = pad();
    TestBed.inject(PadSettingsStore).setSize(140);
    fixture.componentRef.setInput('zoom', 0.5);
    fixture.detectChanges();

    const wrap = fixture.nativeElement.firstElementChild as HTMLElement;
    expect(wrap.style.getPropertyValue('--nc-pad-key')).toBe('39px');
    expect(wrap.style.getPropertyValue('--nc-pad-gap')).toBe('2px');
    expect(wrap.style.getPropertyValue('--nc-pad-inset')).toBe('8px');
  });

  it('leaves a key blank rather than squeeze its legend into it', () => {
    const fixture = pad();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('nc-mark')).toHaveLength(4);

    fixture.componentRef.setInput('zoom', 0.3);
    fixture.detectChanges();

    expect(root.querySelectorAll('nc-mark')).toHaveLength(0);
    expect(root.textContent.trim()).toBe('');
    expect(drawn(fixture)).toHaveLength(9);
    expect(root.querySelector('[data-nc-control="a"]')?.getAttribute('aria-label')).toBe('A');
  });

  it('dims only the overlay, so the zone under the screen stays solid', () => {
    const store = TestBed.inject(PadSettingsStore);
    store.setOpacity(50);

    const zone = pad();
    expect((zone.nativeElement.firstElementChild as HTMLElement).style.opacity).toBe('1');

    const overlay = pad();
    overlay.componentRef.setInput('overlay', true);
    overlay.detectChanges();
    expect((overlay.nativeElement.firstElementChild as HTMLElement).style.opacity).toBe('0.5');
  });

  /** `TouchSource` finds controls by this attribute; renaming one silently unbinds a button. */
  it('keeps every control of a gamepad addressable by data-nc-control', () => {
    expect(drawn(pad())).toEqual([
      'dpad-up',
      'dpad-left',
      'dpad-right',
      'dpad-down',
      'start',
      'y',
      'x',
      'b',
      'a',
    ]);
  });

  it('draws only the controls the game uses, each where a pad has it', () => {
    const fixture = pad(['dpad-left', 'dpad-right', 'a']);
    expect(drawn(fixture)).toEqual(['dpad-left', 'dpad-right', 'a']);
    const jump = (fixture.nativeElement as HTMLElement).querySelector('[data-nc-control="a"]');
    expect(jump).toHaveClass('col-start-6', 'row-start-[r3]');

    fixture.componentRef.setInput('controls', ['start']);
    fixture.detectChanges();
    expect(drawn(fixture)).toEqual(['start']);
  });

  it('draws its arrows with the kit mark, never a character', () => {
    const fixture = pad();
    const up = (fixture.nativeElement as HTMLElement).querySelector('[data-nc-control="dpad-up"]');
    expect(up?.querySelector('nc-mark svg')).not.toBeNull();
    expect(up?.textContent?.trim()).toBe('');
    expect(up?.getAttribute('aria-label')).toBe('Up');
  });
});
