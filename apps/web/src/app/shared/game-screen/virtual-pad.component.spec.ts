import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PadSettingsStore } from './pad-settings.store';
import { VirtualPadComponent } from './virtual-pad.component';

function installMemoryStorage(): void {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => {
      mem.clear();
    },
  };
}

describe('VirtualPadComponent', () => {
  beforeEach(() => {
    installMemoryStorage();
    TestBed.resetTestingModule();
  });

  /**
   * The settings panel and the pad have to agree, or the preview is a lie. They agree through one
   * custom property, so this is the join worth pinning.
   */
  it('scales its targets from the shared pad setting', () => {
    const fixture = TestBed.createComponent(VirtualPadComponent);
    fixture.detectChanges();
    const wrap = fixture.nativeElement.firstElementChild as HTMLElement;
    expect(wrap.style.getPropertyValue('--nc-pad-scale')).toBe('1');

    TestBed.inject(PadSettingsStore).setSize(140);
    fixture.detectChanges();
    expect(wrap.style.getPropertyValue('--nc-pad-scale')).toBe('1.4');
  });

  it('dims only the overlay, so the zone under the screen stays solid', () => {
    const store = TestBed.inject(PadSettingsStore);
    store.setOpacity(50);

    const zone = TestBed.createComponent(VirtualPadComponent);
    zone.detectChanges();
    expect((zone.nativeElement.firstElementChild as HTMLElement).style.opacity).toBe('1');

    const overlay = TestBed.createComponent(VirtualPadComponent);
    overlay.componentRef.setInput('overlay', true);
    overlay.detectChanges();
    expect((overlay.nativeElement.firstElementChild as HTMLElement).style.opacity).toBe('0.5');
  });

  /** `TouchSource` finds controls by this attribute; renaming one silently unbinds a button. */
  it('keeps every action addressable by data-nc-action', () => {
    const fixture = TestBed.createComponent(VirtualPadComponent);
    fixture.detectChanges();
    const actions = [...fixture.nativeElement.querySelectorAll('[data-nc-action]')].map(
      (e: Element) => e.getAttribute('data-nc-action'),
    );
    expect(actions).toEqual(['up', 'left', 'right', 'down', 'pause', 'b', 'a']);
  });
});
