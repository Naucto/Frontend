import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { ShelfComponent } from './shelf.component';
import { ShelfFlyoutDirective, ShelfItemDirective } from './shelf-item.directive';

@Component({
  imports: [ShelfComponent, ShelfItemDirective, ShelfFlyoutDirective],
  template: `
    <nc-shelf heading="Popular" [rows]="rows()" [(page)]="page">
      <a shelfAction href="#all">See all 14</a>
      <a
        *ncShelfItem="let name of names; open as open; flyoutId as flyoutId"
        href="#game"
        [attr.aria-expanded]="flyoutId ? open : null"
        [attr.aria-controls]="flyoutId">
        {{ name }}
      </a>
      <p *ncShelfFlyout="let name of names; when: speaks">About {{ name }}</p>
    </nc-shelf>
  `,
})
class HostComponent {
  readonly names = Array.from({ length: 14 }, (_, i) => `game ${String(i)}`);
  readonly page = signal(0);
  readonly rows = signal(1);
  readonly speaks = (name: string): boolean => name !== 'game 2';
}

/** jsdom lays nothing out: the shelf keeps the width it assumes, 1100, so four items a page. */
function installLayoutStubs(): void {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe(): void {}
    disconnect(): void {}
  };
  HTMLElement.prototype.setPointerCapture = (): void => {};
}

function pointer(
  target: Element,
  type: string,
  pointerType: string,
  at: { x?: number; y?: number } = {},
): void {
  const event = new MouseEvent(type, { bubbles: true, clientX: at.x ?? 0, clientY: at.y ?? 0 });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
}

describe('ShelfComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let shelf: HTMLElement;

  const items = (): HTMLElement[] => [...shelf.querySelectorAll<HTMLElement>('[role="listitem"]')];
  const link = (index: number): HTMLAnchorElement =>
    items()[index]!.querySelector<HTMLAnchorElement>('.lift a')!;
  const live = (): string => shelf.querySelector('[aria-live]')!.textContent.trim();
  const arrow = (name: string): HTMLButtonElement =>
    shelf.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
  const open = (): number[] =>
    items()
      .filter((item) => item.classList.contains('open'))
      .map((item) => Number(item.dataset.index));

  beforeEach(() => {
    installLayoutStubs();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    shelf = (fixture.nativeElement as HTMLElement).querySelector('nc-shelf')!;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a labelled carousel that says which page it is on', () => {
    expect(shelf.getAttribute('role')).toBe('region');
    expect(shelf.getAttribute('aria-roledescription')).toBe('carousel');
    expect(document.getElementById(shelf.getAttribute('aria-labelledby')!)?.textContent).toContain(
      'Popular',
    );
    expect(live()).toBe('Page 1 of 4');
    expect(shelf.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(items()[5]!.getAttribute('aria-label')).toBe('6 of 14');
  });

  it('lets only the current page be reached, and draws the far pages as empty places', () => {
    expect(items().map((item) => item.hasAttribute('inert'))).toEqual([
      ...Array<boolean>(4).fill(false),
      ...Array<boolean>(10).fill(true),
    ]);
    expect(items()[7]!.querySelector('a')).not.toBeNull();
    expect(items()[8]!.childElementCount).toBe(0);
  });

  it('pages with its arrows, which are hidden where there is nowhere to go', () => {
    expect(arrow('Previous page').classList).toContain('invisible');
    arrow('Next page').click();
    fixture.detectChanges();

    expect(live()).toBe('Page 2 of 4');
    expect(fixture.componentInstance.page()).toBe(1);
    expect(shelf.querySelector<HTMLElement>('.rail')!.style.left).toBe('-1116px');
    expect(arrow('Previous page').classList).not.toContain('invisible');

    fixture.componentInstance.page.set(3);
    fixture.detectChanges();
    expect(arrow('Next page').classList).toContain('invisible');
  });

  it('pages on the arrow keys, around the ends, and carries the focus to the page that came', async () => {
    link(0).focus();
    link(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(live()).toBe('Page 4 of 4');
    expect(document.activeElement).toBe(link(12));
  });

  it('opens the flyout of an item after a second under the mouse, and closes it when it leaves', () => {
    vi.useFakeTimers();
    pointer(items()[1]!, 'pointerenter', 'mouse');
    vi.advanceTimersByTime(999);
    fixture.detectChanges();
    expect(open()).toEqual([]);

    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(open()).toEqual([1]);
    const flyout = document.getElementById(link(1).getAttribute('aria-controls')!)!;
    expect(link(1).getAttribute('aria-expanded')).toBe('true');
    expect(flyout.getAttribute('aria-hidden')).toBe('false');
    expect(flyout.textContent).toContain('About game 1');

    pointer(items()[1]!, 'pointerleave', 'mouse');
    fixture.detectChanges();
    expect(open()).toEqual([]);
    expect(flyout.getAttribute('aria-hidden')).toBe('true');
  });

  it('opens nothing for an item that has nothing to say, nor under a finger passing over', () => {
    vi.useFakeTimers();
    pointer(items()[2]!, 'pointerenter', 'mouse');
    pointer(items()[1]!, 'pointerenter', 'touch');
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();

    expect(open()).toEqual([]);
    expect(link(2).hasAttribute('aria-controls')).toBe(false);
  });

  it('opens at once under keyboard focus, and closes on Escape', () => {
    const matches = vi
      .spyOn(Element.prototype, 'matches')
      .mockImplementation((selector) => selector === ':focus-visible');
    link(1).dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    fixture.detectChanges();
    expect(open()).toEqual([1]);
    expect(shelf.classList).toContain('by-keys');

    link(1).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(open()).toEqual([]);
    matches.mockRestore();
  });

  it('opens on the first tap of a finger and leaves the second to the item', () => {
    const tap = (): boolean => {
      pointer(link(1), 'pointerdown', 'touch');
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      link(1).dispatchEvent(click);
      fixture.detectChanges();
      return click.defaultPrevented;
    };
    link(1).addEventListener('click', (event) => {
      event.preventDefault();
    });
    const reached = vi.fn();
    link(1).addEventListener('click', reached);

    expect(tap()).toBe(true);
    expect(reached).not.toHaveBeenCalled();
    expect(open()).toEqual([1]);

    tap();
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it('pages on a swipe past the threshold, and swallows the click that ends it', () => {
    const track = shelf.querySelector<HTMLElement>('.track')!;
    pointer(track, 'pointerdown', 'mouse', { x: 600, y: 100 });
    pointer(track, 'pointermove', 'mouse', { x: 400, y: 104 });
    fixture.detectChanges();
    expect(shelf.querySelector<HTMLElement>('.rail')!.style.left).toBe('-200px');

    pointer(track, 'pointerup', 'mouse');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link(1).dispatchEvent(click);
    fixture.detectChanges();

    expect(live()).toBe('Page 2 of 4');
    expect(click.defaultPrevented).toBe(true);
  });

  it('resists a swipe past either end, and comes back', () => {
    const track = shelf.querySelector<HTMLElement>('.track')!;
    pointer(track, 'pointerdown', 'mouse', { x: 100, y: 100 });
    pointer(track, 'pointermove', 'mouse', { x: 400, y: 100 });
    fixture.detectChanges();
    expect(shelf.querySelector<HTMLElement>('.rail')!.style.left).toBe('100px');

    pointer(track, 'pointerup', 'mouse');
    fixture.detectChanges();
    expect(live()).toBe('Page 1 of 4');
    expect(shelf.querySelector<HTMLElement>('.rail')!.style.left).toBe('0px');
  });

  describe('two rows high', () => {
    beforeEach(() => {
      fixture.componentInstance.rows.set(2);
      fixture.detectChanges();
    });

    it('pages eight at a time, each page filled row by row', () => {
      expect(live()).toBe('Page 1 of 2');
      expect(items().filter((item) => !item.hasAttribute('inert'))).toHaveLength(8);
      const place = (index: number): string =>
        `${items()[index]!.style.gridRow} / ${items()[index]!.style.gridColumn}`;
      expect([0, 3, 4, 7, 8, 13].map(place)).toEqual([
        '1 / 1',
        '1 / 4',
        '2 / 1',
        '2 / 4',
        '1 / 5',
        '2 / 6',
      ]);
    });

    it('moves a whole page on the arrows, by as many columns as one row holds', () => {
      arrow('Next page').click();
      fixture.detectChanges();
      expect(live()).toBe('Page 2 of 2');
      expect(shelf.querySelector<HTMLElement>('.rail')!.style.left).toBe('-1116px');
      expect(arrow('Next page').classList).toContain('invisible');
    });

    it('opens a flyout beside an item of the second row, on the side its column has room', () => {
      vi.useFakeTimers();
      pointer(items()[7]!, 'pointerenter', 'mouse');
      vi.advanceTimersByTime(1000);
      fixture.detectChanges();

      expect(open()).toEqual([7]);
      const flyout = items()[7]!.querySelector<HTMLElement>('nc-shelf-flyout')!;
      expect(flyout.classList).toContain('flex-row-reverse');
      expect(flyout.textContent).toContain('About game 7');
    });
  });

  it('leaves a vertical swipe to the page', () => {
    const track = shelf.querySelector<HTMLElement>('.track')!;
    pointer(track, 'pointerdown', 'touch', { x: 600, y: 100 });
    pointer(track, 'pointermove', 'touch', { x: 590, y: 300 });
    pointer(track, 'pointermove', 'touch', { x: 300, y: 320 });
    pointer(track, 'pointerup', 'touch');
    fixture.detectChanges();

    expect(live()).toBe('Page 1 of 4');
  });
});
