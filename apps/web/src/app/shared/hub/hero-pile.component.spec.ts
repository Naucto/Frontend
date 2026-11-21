import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testProviders } from '../../testing/providers';
import { type HeroEntry, HeroPileComponent } from './hero-pile.component';
import type { HubGame } from './hub-game';
import { gameOf, installLayoutStubs, pointer } from './testing';

const ENTRIES: HeroEntry[] = [
  { reason: 'Game of the week', game: gameOf(1) },
  { reason: 'Continue', game: gameOf(2), mine: true },
  { reason: 'Trending', game: gameOf(3) },
  { reason: 'New and rising', game: gameOf(4) },
];

describe('HeroPileComponent', () => {
  let fixture: ComponentFixture<HeroPileComponent>;
  let hero: HTMLElement;
  let now: number;

  const status = (): string => hero.querySelector('[role="status"]')!.textContent.trim();
  const front = (): number => fixture.componentInstance.index();
  const pile = (): HTMLElement => hero.querySelector<HTMLElement>('.touch-pan-y')!;
  const key = (name: string): void => {
    hero
      .querySelector('section')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  const wheel = (deltaY: number): boolean => {
    const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
    pile().dispatchEvent(event);
    fixture.detectChanges();
    return event.defaultPrevented;
  };

  beforeEach(() => {
    installLayoutStubs();
    now = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: testProviders() });
    fixture = TestBed.createComponent(HeroPileComponent);
    fixture.componentRef.setInput('entries', ENTRIES);
    fixture.detectChanges();
    hero = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a carousel that tells a screen reader the disk in front, and hides the scrambled text', () => {
    const section = hero.querySelector('section')!;
    expect(section.getAttribute('aria-roledescription')).toBe('carousel');
    expect(section.getAttribute('aria-label')).toBe('Featured games');
    expect(status()).toBe('1 of 4: Game 1, by maker1, 1k plays. What game 1 is.');
    expect(hero.querySelector('h2')?.getAttribute('aria-hidden')).toBe('true');
    expect(hero.querySelector('h2')?.textContent).toContain('Game 1');
    expect(hero.textContent).toContain('Game of the week');
  });

  it('offers the disk in front to play and the others to show, one tab stop among them', () => {
    const buttons = [...hero.querySelectorAll<HTMLButtonElement>('button:not([role="tab"])')];
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Play Game 1',
      'Show Game 2',
      'Show Game 3',
      'Show Game 4',
    ]);
    expect(buttons.map((button) => button.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
      '-1',
    ]);

    const played = vi.fn<(game: HubGame) => void>();
    fixture.componentInstance.picked.subscribe(played);
    buttons[2]!.click();
    fixture.detectChanges();
    expect(front()).toBe(2);
    expect(played).not.toHaveBeenCalled();

    buttons[2]!.click();
    expect(played).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
  });

  it('fans the disks behind the one in front, smaller and dimmer the further they are', () => {
    const cards = [...hero.querySelectorAll<HTMLElement>('.touch-pan-y > div')];
    expect(cards[0]!.style.transform).toBe('translate(0px, 0px) rotate(0deg) scale(1.000)');
    expect(cards[2]!.style.transform).toBe('translate(184px, -60px) rotate(12deg) scale(0.720)');
    expect(cards[0]!.style.opacity).toBe('1');
    expect(Number(cards[3]!.style.opacity)).toBeCloseTo(0.46);
    expect(cards.map((card) => card.style.zIndex)).toEqual(['10', '9', '8', '7']);
  });

  it('says the own game of the viewer in a chip beside the reason, and leaves out its byline', () => {
    expect(hero.querySelector('nc-avatar')).not.toBeNull();
    expect(hero.querySelector('nc-chip')).toBeNull();
    key('ArrowRight');
    expect(hero.querySelector('nc-avatar')).toBeNull();
    expect(hero.querySelector('nc-chip')?.textContent.trim()).toBe('Your game');
  });

  it('moves on the arrows, Home and End, and stops at both ends', () => {
    key('ArrowRight');
    key('ArrowDown');
    expect(front()).toBe(2);
    key('End');
    key('ArrowRight');
    expect(front()).toBe(3);
    expect(status()).toContain('4 of 4: Game 4');
    key('ArrowUp');
    expect(front()).toBe(2);
    key('Home');
    key('ArrowLeft');
    expect(front()).toBe(0);
  });

  it('moves one disk for a turn of the wheel, however long the turn goes on', () => {
    expect(wheel(20)).toBe(true);
    expect(front()).toBe(0);
    expect(wheel(30)).toBe(true);
    expect(front()).toBe(1);

    now += 100;
    expect(wheel(120)).toBe(true);
    expect(front()).toBe(1);

    now += 500;
    wheel(60);
    expect(front()).toBe(2);
  });

  it('forgets a turn that stopped short, and gives the wheel back to the page at both ends', () => {
    wheel(30);
    now += 300;
    wheel(30);
    expect(front()).toBe(0);

    expect(wheel(-100)).toBe(false);
    fixture.componentInstance.index.set(3);
    fixture.detectChanges();
    expect(wheel(100)).toBe(false);
    expect(front()).toBe(3);
  });

  it('moves a disk for every stretch of a drag, and swallows the click that ends it', () => {
    fixture.componentInstance.index.set(3);
    fixture.detectChanges();
    pointer(pile(), 'pointerdown', 'mouse', { x: 100, y: 200 });
    pointer(pile(), 'pointermove', 'mouse', { x: 185, y: 200 });
    pointer(pile(), 'pointermove', 'mouse', { x: 270, y: 204 });
    pointer(pile(), 'pointerup', 'mouse', { x: 270, y: 204 });
    fixture.detectChanges();
    expect(front()).toBe(1);

    const played = vi.fn();
    fixture.componentInstance.picked.subscribe(played);
    hero.querySelector<HTMLButtonElement>('button[tabindex="0"]')!.click();
    expect(played).not.toHaveBeenCalled();
  });

  it('names its dots after the games', () => {
    const dots = [...hero.querySelectorAll('[role="tab"]')];
    expect(dots.map((dot) => dot.getAttribute('aria-label'))).toEqual([
      'Game 1',
      'Game 2',
      'Game 3',
      'Game 4',
    ]);
    (dots[3] as HTMLElement).click();
    fixture.detectChanges();
    expect(front()).toBe(3);
  });
});
