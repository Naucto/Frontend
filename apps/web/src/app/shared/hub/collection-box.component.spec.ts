import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { testProviders } from '../../testing/providers';
import { CollectionBoxComponent } from './collection-box.component';
import type { HubGame } from './hub-game';
import { gameOf, installLayoutStubs, pointer } from './testing';

function render(count: number, total = count): ComponentFixture<CollectionBoxComponent> {
  const fixture = TestBed.createComponent(CollectionBoxComponent);
  const inputs = {
    title: 'Couch co-op',
    curator: { id: 7, username: 'louis' },
    games: Array.from({ length: count }, (_, i) => gameOf(i + 1)),
    total,
    link: ['/collections', 'abc'],
  };
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return fixture;
}

describe('CollectionBoxComponent', () => {
  let fixture: ComponentFixture<CollectionBoxComponent>;
  let box: HTMLElement;

  const disks = (): HTMLElement[] => [...box.querySelectorAll<HTMLElement>('.disk')];
  const crown = (): number => disks().findIndex((disk) => disk.style.transform.includes('1.333'));
  const press = (target: Element): void => {
    pointer(target, 'pointerdown', 'mouse');
    pointer(target, 'pointerup', 'mouse');
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  /** jsdom measures every box as empty: the box is given the place it would have on a page. */
  const place = (): void => {
    box = fixture.nativeElement as HTMLElement;
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 312, 290));
  };
  const hover = (): void => {
    pointer(box, 'pointermove', 'mouse', { x: 150, y: 100 });
    fixture.detectChanges();
  };

  beforeEach(() => {
    installLayoutStubs();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: testProviders() });
    fixture = render(6);
    place();
  });

  it('names the collection for the group, and for the plate that opens it', () => {
    const label = 'Couch co-op, 6 games, curated by louis';
    expect(box.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(label);
    const plate = box.querySelector<HTMLAnchorElement>('a[data-plate]');
    expect(plate?.getAttribute('aria-label')).toBe(`Open ${label}`);
    expect(plate?.getAttribute('href')).toBe('/collections/abc');
    expect(plate?.textContent).toContain('6 games');
  });

  it('stands its disks a step apart at rest, each a button named for its game', () => {
    expect(disks().map((disk) => disk.style.left)).toEqual([
      '0px',
      '12px',
      '24px',
      '36px',
      '48px',
      '60px',
    ]);
    expect(disks()[2]?.getAttribute('aria-label')).toBe('Game 3');
    expect(box.classList).not.toContain('docked');
  });

  it('fans out under the mouse with the middle disk at the crown, and settles when it leaves', () => {
    hover();
    expect(box.classList).toContain('docked');
    expect(crown()).toBe(2);
    expect(new Set(disks().map((disk) => disk.style.left)).size).toBe(1);

    pointer(box, 'pointerleave', 'mouse');
    fixture.detectChanges();
    expect(box.classList).not.toContain('docked');
    expect(crown()).toBe(-1);
  });

  it('brings a pressed disk to the crown, and picks the one that is already there', () => {
    const picked = vi.fn<(game: HubGame) => void>();
    fixture.componentInstance.picked.subscribe(picked);
    hover();

    press(disks()[4]!);
    expect(crown()).toBe(4);
    expect(picked).not.toHaveBeenCalled();

    press(disks()[4]!);
    expect(picked).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
  });

  it('moves the crown under a drag, and lands on a whole disk', () => {
    hover();
    pointer(box, 'pointerdown', 'mouse', { x: 200, y: 100 });
    pointer(box, 'pointermove', 'mouse', { x: 100, y: 100, time: 100 });
    fixture.detectChanges();
    expect(box.classList).toContain('nc-panning');

    pointer(box, 'pointerup', 'mouse', { x: 100, y: 100, time: 300 });
    fixture.detectChanges();
    expect(box.classList).not.toContain('nc-panning');
    expect(crown()).toBe(4);
  });

  it('lets a flick carry the dock on past where the hand let go', () => {
    hover();
    pointer(box, 'pointerdown', 'mouse', { x: 200, y: 100 });
    pointer(box, 'pointermove', 'mouse', { x: 170, y: 100, time: 20 });
    fixture.detectChanges();
    pointer(box, 'pointerup', 'mouse', { x: 170, y: 100, time: 30 });
    fixture.detectChanges();

    expect(crown()).toBe(4);
  });

  it('closes when the mouse goes down onto the plate', () => {
    hover();
    pointer(box, 'pointermove', 'mouse', { x: 150, y: 250 });
    fixture.detectChanges();
    expect(box.classList).not.toContain('docked');
  });

  it('follows the keyboard: the focused disk takes the crown, the arrows move along the dock', () => {
    disks()[0]!.focus();
    fixture.detectChanges();
    expect(crown()).toBe(0);

    disks()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(disks()[1]);
    expect(crown()).toBe(1);

    disks()[1]!.blur();
    fixture.detectChanges();
    expect(box.classList).not.toContain('docked');
  });

  it('spreads a collection too large for the row, and ends it on a tile for the rest', () => {
    fixture = render(20, 52);
    place();

    expect(box.querySelectorAll('button.disk')).toHaveLength(16);
    const tile = box.querySelector<HTMLAnchorElement>('.disk a');
    expect(tile?.textContent).toContain('36');
    expect(tile?.getAttribute('aria-label')).toBe('Show all 52 games in Couch co-op');
    expect(tile?.getAttribute('href')).toBe('/collections/abc');
    expect(disks().at(-1)?.style.left).toBe('168px');
  });
});
