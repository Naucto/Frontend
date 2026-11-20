import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { testProviders } from '../../testing/providers';
import { GameFlyoutComponent } from './game-flyout.component';
import type { HubSession } from './hub-game';
import { SessionFlyoutComponent } from './session-flyout.component';
import { ShelfDiskComponent } from './shelf-disk.component';
import { gameOf, installLayoutStubs } from './testing';

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
    const session: HubSession = {
      id: 'room',
      startedAt: new Date(Date.now() - 12 * 60_000 - 5000).toISOString(),
      hostId: 2,
      players: [
        { id: 1, username: 'you' },
        { id: 2, username: 'lea' },
        { id: 3, username: 'emma' },
      ],
      capacity: 5,
    };

    beforeEach(() => {
      fixture = TestBed.createComponent(SessionFlyoutComponent);
      fixture.componentRef.setInput('session', session);
      fixture.componentRef.setInput('description', 'Four corners, too many bombs.');
      fixture.componentRef.setInput('viewerId', 1);
      fixture.detectChanges();
      host = fixture.nativeElement as HTMLElement;
    });

    it('says when it started, what the game is and how full it is', () => {
      expect(text(host)).toContain('Started 12 min ago Four corners, too many bombs.');
      expect(text(host)).toContain('Players 3/5');
    });

    it('lists the players under a label, the host badged, the seats left last', () => {
      const list = host.querySelector('ul')!;
      expect(list.getAttribute('aria-label')).toBe('Players');
      expect([...list.querySelectorAll('li')].map(text)).toEqual([
        'L lea Host',
        'Y you Leave',
        'E emma',
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
    fixture.componentRef.setInput('link', ['/play', 7]);
    fixture.detectChanges();
  });

  it('is the link to the game, named for it, around its disk', () => {
    expect(link().getAttribute('href')).toBe('/play/7');
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
