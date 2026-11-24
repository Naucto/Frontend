import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { uuidOf } from '@naucto/api-client/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { testProviders } from '../../testing/providers';
import { GameFlyoutComponent } from './game-flyout.component';
import { SessionDiskComponent } from './session-disk.component';
import { SessionFlyoutComponent } from './session-flyout.component';
import { ShelfDiskComponent } from './shelf-disk.component';
import { gameOf, installLayoutStubs, sessionOf } from './testing';

const text = (element: Element | null | undefined): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('the bodies of a shelf flyout', () => {
  beforeEach(() => {
    installLayoutStubs();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: testProviders() });
  });

  it('says a game by its name, what it is, its plays and its tags', () => {
    const fixture = TestBed.createComponent(GameFlyoutComponent);
    fixture.componentRef.setInput('game', gameOf(12, { tags: ['puzzle', 'chill'] }));
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(text(host)).toContain('Game 12 What game 12 is. 12k');
    expect([...host.querySelectorAll('nc-chip')].map(text)).toEqual(['puzzle', 'chill']);
  });

  describe('for a session', () => {
    let fixture: ComponentFixture<SessionFlyoutComponent>;
    let host: HTMLElement;
    const session = sessionOf(3, 5, {
      startedAt: new Date(Date.now() - 12 * 60_000 - 5000).toISOString(),
      projectName: 'Bomberman',
      hostUsername: 'lea',
      roster: [
        { id: uuidOf(1), username: 'you' },
        { id: uuidOf(2), username: 'lea' },
        { id: uuidOf(3), username: 'emma', nickname: 'Emma B' },
      ],
    });

    beforeEach(() => {
      fixture = TestBed.createComponent(SessionFlyoutComponent);
      fixture.componentRef.setInput('session', session);
      fixture.componentRef.setInput('viewer', 'you');
      fixture.detectChanges();
      host = fixture.nativeElement as HTMLElement;
    });

    it('says when it started, which game it is and how full it is', () => {
      expect(text(host)).toContain('Started 12 min ago Bomberman');
      expect(text(host)).toContain('Players 3 of 5');
    });

    it('lists the players under a label, the host badged, the seats left last', () => {
      const list = host.querySelector('ul')!;
      expect(list.getAttribute('aria-label')).toBe('Players');
      expect([...list.querySelectorAll('li')].map(text)).toEqual([
        'L lea Host',
        'Y you Leave',
        'E Emma B',
        '2 open seats',
      ]);
      expect(list.querySelector('nc-avatar')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('lets the viewer leave from their own row', () => {
      const left = vi.fn();
      fixture.componentInstance.leave.subscribe(left);
      host.querySelector('button')?.click();
      expect(left).toHaveBeenCalledTimes(1);
    });

    it('says a session that has only just begun', () => {
      fixture.componentRef.setInput('session', { ...session, startedAt: new Date().toISOString() });
      fixture.detectChanges();
      expect(text(host)).toContain('Just started');
    });
  });
});

describe('ShelfDiskComponent', () => {
  let fixture: ComponentFixture<ShelfDiskComponent>;
  const link = (): HTMLAnchorElement =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a')!;

  beforeEach(() => {
    installLayoutStubs();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: testProviders() });
    fixture = TestBed.createComponent(ShelfDiskComponent);
    fixture.componentRef.setInput('game', gameOf(7));
    fixture.componentRef.setInput('link', ['/play', uuidOf(7)]);
    fixture.detectChanges();
  });

  it('is the link to the game, named for it, around its disk', () => {
    expect(link().getAttribute('href')).toBe(`/play/${uuidOf(7)}`);
    expect(link().getAttribute('aria-label')).toBe('Game 7');
    expect(link().querySelector('nc-floppy')).not.toBeNull();
    expect(link().hasAttribute('aria-expanded')).toBe(false);
  });

  it('says which flyout it controls, and that it describes the link while it is open', () => {
    fixture.componentRef.setInput('flyoutId', 'flyout-7');
    fixture.detectChanges();
    expect(link().getAttribute('aria-controls')).toBe('flyout-7');
    expect(link().getAttribute('aria-expanded')).toBe('false');
    expect(link().hasAttribute('aria-describedby')).toBe(false);

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(link().getAttribute('aria-expanded')).toBe('true');
    expect(link().getAttribute('aria-describedby')).toBe('flyout-7');
    expect(link().querySelector('nc-floppy')?.classList).toContain('open');
  });
});

describe('SessionDiskComponent', () => {
  let fixture: ComponentFixture<SessionDiskComponent>;
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    installLayoutStubs();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: testProviders() });
    fixture = TestBed.createComponent(SessionDiskComponent);
    fixture.componentRef.setInput('session', sessionOf(2, 4));
    fixture.componentRef.setInput('link', ['/play', uuidOf(7)]);
    fixture.componentRef.setInput('viewer', 'you');
    fixture.detectChanges();
  });

  it('is the link to the game, wearing its players and its open seats', () => {
    expect(host().querySelector('a')?.getAttribute('aria-label')).toBe('Game 7');
    expect(host().querySelectorAll('.sticker .card')).toHaveLength(3);
    expect(host().querySelectorAll('.sticker .seat')).toHaveLength(2);
    expect(host().querySelectorAll('.sticker.away')).toHaveLength(1);
  });

  it('wears the disk the author of its game chose, and a plastic of its own without one', () => {
    const body = (): string =>
      host().querySelector<HTMLElement>('nc-floppy')?.style.getPropertyValue('--f-body') ?? '';
    const plastic = body();
    expect(plastic).toMatch(/^#[0-9a-f]{6}$/);

    fixture.componentRef.setInput(
      'session',
      sessionOf(2, 4, { disk: { color: '#ff80a4', finish: 'solid' } }),
    );
    fixture.detectChanges();
    expect(body()).toBe('#ff80a4');
    expect(body()).not.toBe(plastic);
  });

  it('offers to join, and a press on it joins without following the link', () => {
    const joined = vi.fn();
    fixture.componentInstance.joined.subscribe(joined);
    const followed = vi.fn();
    host().querySelector('a')?.addEventListener('click', followed);

    host().querySelector<HTMLElement>('.action.join')?.click();
    expect(joined).toHaveBeenCalledTimes(1);
    expect(followed).not.toHaveBeenCalled();
  });

  it('offers nothing once the viewer is in, or when no seat is left', () => {
    const session = sessionOf(2, 4);
    fixture.componentRef.setInput('session', {
      ...session,
      roster: [...session.roster, { id: uuidOf(9), username: 'you' }],
      playerCount: 3,
    });
    fixture.detectChanges();
    expect(host().querySelector('.action')).toBeNull();
    expect(host().querySelectorAll('.sticker.away .seat')).toHaveLength(1);

    fixture.componentRef.setInput('session', sessionOf(4, 4));
    fixture.detectChanges();
    expect(host().querySelector('.action')).toBeNull();
  });
});
