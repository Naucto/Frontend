import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FloppyComponent, type FloppySticker } from './floppy.component';

/** Frames asked for and not yet run: the lift is eased on them. */
const frames = new Map<number, FrameRequestCallback>();
let asked = 0;
let reducedMotion = false;

/** jsdom lays nothing out and draws nothing: the disk only asks when to measure and when to move. */
function installBrowserStubs(): void {
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
  vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
    frames.set(++asked, frame);
    return asked;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
}

function render(inputs: Record<string, unknown>): ComponentFixture<FloppyComponent> {
  const fixture = TestBed.createComponent(FloppyComponent);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  host.getBoundingClientRect = () => new DOMRect(0, 0, 200, 204);
  return fixture;
}

function point(host: HTMLElement, type: string, pointerType: string, x = 100, y = 102): void {
  const event = new MouseEvent(type, { clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  host.dispatchEvent(event);
}

/** Run the frames out, far enough in time that the easing has arrived. */
function settle(fixture: ComponentFixture<FloppyComponent>): void {
  while (frames.size) {
    for (const [id, frame] of [...frames]) {
      frames.delete(id);
      frame(performance.now() + 1000);
    }
  }
  fixture.detectChanges();
}

describe('FloppyComponent', () => {
  beforeEach(() => {
    frames.clear();
    reducedMotion = false;
    installBrowserStubs();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('raises a diamond for the action it is given, and none without one', () => {
    for (const action of ['play', 'edit', 'join']) {
      const host = render({ action }).nativeElement as HTMLElement;
      expect(host.querySelector('.action')?.classList).toContain(action);
    }
    expect((render({}).nativeElement as HTMLElement).querySelector('.action')).toBeNull();
  });

  /** Play and edit are the link's to follow; join is an act of its own on a disk that links on. */
  it('keeps a press on join to itself and lets the others through', () => {
    const press = (action: string): { acted: number; passed: boolean } => {
      const fixture = render({ action });
      let acted = 0;
      fixture.componentInstance.acted.subscribe(() => acted++);
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      const passed =
        (fixture.nativeElement as HTMLElement).querySelector('.action')?.dispatchEvent(click) ??
        false;
      return { acted, passed };
    };

    expect(press('join')).toEqual({ acted: 1, passed: false });
    expect(press('play')).toEqual({ acted: 0, passed: true });
  });

  it('takes its plastic from the style, a metal from the metal, and its open state from the input', () => {
    const fixture = render({ disk: { color: '#007899', finish: 'stripes' } });
    const host = fixture.nativeElement as HTMLElement;
    expect(host.style.getPropertyValue('--f-body')).toBe('#007899');
    expect(host.querySelector<HTMLElement>('.finish')?.style.background).toContain(
      'repeating-linear-gradient',
    );
    expect(host.classList).not.toContain('open');

    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('disk', { color: '#007899', finish: 'gold' });
    fixture.detectChanges();
    expect(host.classList).toContain('open');
    expect(host.style.getPropertyValue('--f-body')).toBe('#d9a62a');
  });

  it('flips the ink of the band on a pale plastic', () => {
    expect(
      (render({ disk: { color: '#ffd100', finish: 'solid' } }).nativeElement as HTMLElement)
        .classList,
    ).toContain('pale');
    expect(
      (render({ disk: { color: '#234975', finish: 'solid' } }).nativeElement as HTMLElement)
        .classList,
    ).not.toContain('pale');
  });

  it('lays the author and the counts along the bottom of the label', () => {
    const band = (inputs: Record<string, unknown>): string | undefined =>
      (render({ info: 'bandBottom', by: 'louis', ...inputs }).nativeElement as HTMLElement)
        .querySelector('.info')
        ?.textContent.replace(/\s+/g, ' ')
        .trim();

    expect(band({ likes: 1247, comments: 0 })).toBe('louis 1.2k 0');
    expect(band({})).toBe('louis');
    expect(
      (render({ by: 'louis' }).nativeElement as HTMLElement).querySelector('.info'),
    ).toBeNull();
  });

  it('lifts toward a mouse, lights its edges and its face, and comes back down', () => {
    const fixture = render({});
    const host = fixture.nativeElement as HTMLElement;

    point(host, 'pointerenter', 'mouse', 50, 51);
    settle(fixture);
    expect(host.classList).toContain('lit');
    expect(host.style.getPropertyValue('--f-lift')).toBe('1.000');
    expect(host.querySelectorAll('.edge').length).toBe(4);
    expect(host.querySelectorAll('.shine > span').length).toBe(16);
    // A quarter in from the top left: that corner is pressed away.
    expect(host.style.getPropertyValue('--f-lean-y')).toBe('-11.00deg');
    expect(host.style.getPropertyValue('--f-lean-x')).toBe('9.00deg');

    point(host, 'pointermove', 'mouse', 200, 102);
    expect(host.style.getPropertyValue('--f-lean-y')).toBe('22.00deg');
    expect(host.style.getPropertyValue('--f-lean-x')).toBe('0.00deg');

    point(host, 'pointerleave', 'mouse');
    settle(fixture);
    expect(host.classList).not.toContain('lit');
    expect(host.style.getPropertyValue('--f-lift')).toBe('0.000');
    expect(host.querySelector('.edge')).toBeNull();
    expect(host.querySelector('.shine')).toBeNull();
  });

  it('stays flat under a touch, when it is not interactive, and when motion is reduced', () => {
    const flat = (inputs: Record<string, unknown>, pointerType: string): boolean => {
      const fixture = render(inputs);
      point(fixture.nativeElement as HTMLElement, 'pointerenter', pointerType);
      settle(fixture);
      return !(fixture.nativeElement as HTMLElement).classList.contains('lit');
    };

    expect(flat({}, 'touch')).toBe(true);
    expect(flat({ interactive: false }, 'mouse')).toBe(true);
    reducedMotion = true;
    expect(flat({}, 'mouse')).toBe(true);
  });

  it('shows the cover on the label, and the hatch when there is none', () => {
    const bare = render({}).nativeElement as HTMLElement;
    expect(bare.querySelector('.cover')?.classList).toContain('no-cover');

    const covered = render({ cover: 'data:image/png;base64,AA==' }).nativeElement as HTMLElement;
    expect(covered.querySelector('.cover img')).not.toBeNull();
    expect(covered.querySelector('.cover')?.classList).not.toContain('no-cover');
  });

  it('sticks players, the host mark and open seats where they are placed', () => {
    const stickers: FloppySticker[] = [
      { x: 13, y: 14, rotation: -8, initial: 'L', color: 'rgb(104, 174, 212)', host: true },
      { x: 91, y: 49, rotation: 12, initial: '+3', color: 'rgb(237, 230, 218)' },
      { x: 29, y: 34, rotation: 4, seat: true },
      { x: 29, y: 34, rotation: 4, initial: 'Y', color: 'rgb(255, 209, 0)', hidden: true },
    ];
    const host = render({ stickers }).nativeElement as HTMLElement;
    const [first, more, seat, arriving] = host.querySelectorAll<HTMLElement>('.sticker');

    expect(first?.style.left).toBe('13%');
    expect(first?.style.top).toBe('14%');
    expect(first?.style.rotate).toBe('-8deg');
    expect(first?.querySelector('.initial')?.textContent.trim()).toBe('L');
    expect(first?.querySelector<HTMLElement>('.initial')?.style.backgroundColor).toBe(
      'rgb(104, 174, 212)',
    );
    expect(first?.querySelector('.crown')).not.toBeNull();
    expect(more?.querySelector('.initial')?.textContent.trim()).toBe('+3');
    expect(more?.querySelector('.crown')).toBeNull();
    expect(seat?.querySelector('.seat')).not.toBeNull();
    expect(seat?.querySelector('.card')).toBeNull();
    expect(arriving?.classList).toContain('away');
  });

  it('draws the disk that does not exist yet as an outline that says what it makes', () => {
    const host = render({ action: 'new', caption: 'New game' }).nativeElement as HTMLElement;
    expect(host.classList).toContain('new');
    expect(host.querySelector('.ghost')).not.toBeNull();
    expect(host.querySelector('.caption')?.textContent).toContain('New game');
    expect(host.querySelector('.action')).toBeNull();
    expect(host.style.getPropertyValue('--f-body')).toBe('');
  });
});
