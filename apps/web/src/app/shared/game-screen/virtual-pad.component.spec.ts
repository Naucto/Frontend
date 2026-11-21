import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { TOUCH_CONTROLS, type TouchControl } from '@naucto/engine';
import { beforeEach, describe, expect, it } from 'vitest';

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
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: testProviders() });
  });

  /**
   * The settings panel and the pad have to agree, or the preview is a lie. They agree through one
   * custom property, so this is the join worth pinning.
   */
  it('scales its targets from the shared pad setting', () => {
    const fixture = pad();
    const wrap = fixture.nativeElement.firstElementChild as HTMLElement;
    expect(wrap.style.getPropertyValue('--nc-pad-scale')).toBe('1');

    TestBed.inject(PadSettingsStore).setSize(140);
    fixture.detectChanges();
    expect(wrap.style.getPropertyValue('--nc-pad-scale')).toBe('1.4');
  });

  it('is drawn smaller than life where it is only shown', () => {
    const fixture = pad();
    TestBed.inject(PadSettingsStore).setSize(140);
    fixture.componentRef.setInput('zoom', 0.5);
    fixture.detectChanges();

    const wrap = fixture.nativeElement.firstElementChild as HTMLElement;
    expect(wrap.style.getPropertyValue('--nc-pad-scale')).toBe('0.7');
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
    expect(jump).toHaveClass('col-start-2', 'row-start-3');

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
