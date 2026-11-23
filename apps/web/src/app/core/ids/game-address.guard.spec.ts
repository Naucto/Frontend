import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client } from '@naucto/api-client';
import { uuidOf } from '@naucto/api-client/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gameAddressGuard } from './game-address.guard';

@Component({ template: 'game' })
class GamePage {}

@Component({ template: 'editor' })
class EditorTab {}

@Component({ template: 'not found' })
class NotFoundPage {}

@Component({ template: 'hub' })
class HubPage {}

/** The two addresses of a game as the app declares them, and the page everything else falls to. */
const ROUTES: Routes = [
  { path: 'hub', component: HubPage },
  { path: 'play/:id', canMatch: [gameAddressGuard], component: GamePage },
  {
    path: 'edit/:id',
    canMatch: [gameAddressGuard],
    children: [
      { path: '', redirectTo: 'game', pathMatch: 'full' },
      { path: 'game', component: EditorTab },
      { path: 'code', component: EditorTab },
    ],
  },
  { path: 'staff/edit/:id', redirectTo: ({ params }) => `/edit/${String(params.id)}` },
  { path: '**', component: NotFoundPage },
];

const realFetch = globalThis.fetch;

describe('gameAddressGuard', () => {
  /** Every request the app made, as the path it asked for. */
  let asked: string[];
  let harness: RouterTestingHarness;
  const page = (): string => (harness.routeNativeElement?.textContent ?? '').trim();
  const address = (): string => TestBed.inject(Router).url;

  beforeEach(async () => {
    asked = [];
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    // The server knew project 41, and no other number.
    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const { pathname } = new URL(input instanceof Request ? input.url : input);
      asked.push(pathname);
      return Promise.resolve(
        pathname === '/projects/legacy/41'
          ? Response.json({ id: uuidOf(41) })
          : Response.json({ message: 'Not found' }, { status: 404 }),
      );
    };
    TestBed.configureTestingModule({ providers: [provideRouter(ROUTES)] });
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('lets an id through without asking anything', async () => {
    await harness.navigateByUrl(`/play/${uuidOf(7)}?session=abc`);

    expect(page()).toBe('game');
    expect(address()).toBe(`/play/${uuidOf(7)}?session=abc`);
    expect(asked).toEqual([]);
  });

  it('sends an old play link on to the id, with its query and its fragment', async () => {
    await harness.navigateByUrl('/play/41?session=abc&code=K7QD#comments');

    expect(page()).toBe('game');
    expect(address()).toBe(`/play/${uuidOf(41)}?session=abc&code=K7QD#comments`);
    expect(asked).toEqual(['/projects/legacy/41']);
  });

  it('sends an old editor link on to the id and keeps the tab it named', async () => {
    await harness.navigateByUrl('/edit/41/code');

    expect(page()).toBe('editor');
    expect(address()).toBe(`/edit/${uuidOf(41)}/code`);
  });

  it('sends a bare old editor link on to the id, where the editor picks its tab', async () => {
    await harness.navigateByUrl('/edit/41');

    expect(address()).toBe(`/edit/${uuidOf(41)}/game`);
  });

  it('ends an old staff address at the id as well', async () => {
    await harness.navigateByUrl('/staff/edit/41');

    expect(page()).toBe('editor');
    expect(address()).toBe(`/edit/${uuidOf(41)}/game`);
  });

  /** A link followed inside the app adds one entry, the id's: Back returns to where it was. */
  it('leaves no history entry for the numbered address', async () => {
    const location = TestBed.inject(Location);
    await harness.navigateByUrl('/hub');
    const pushed = vi.spyOn(location, 'go');
    const replaced = vi.spyOn(location, 'replaceState');

    await harness.navigateByUrl('/play/41');

    expect(pushed.mock.calls.map(([path]) => path)).toEqual([`/play/${uuidOf(41)}`]);
    expect(replaced).not.toHaveBeenCalled();
  });

  it('shows not-found for a number no project had, on the address that was asked', async () => {
    await harness.navigateByUrl('/play/999');
    expect(page()).toBe('not found');
    expect(address()).toBe('/play/999');

    await harness.navigateByUrl('/edit/999/game');
    expect(page()).toBe('not found');
    expect(asked).toEqual(['/projects/legacy/999', '/projects/legacy/999']);
  });

  it.each([
    '/play/abc',
    '/play/41abc',
    '/play/-41',
    '/play/4.1',
    `/play/${uuidOf(7).toUpperCase().replace('0', 'A')}`,
    `/play/${uuidOf(7)}0`,
    '/edit/my-game/code',
  ])(
    'shows not-found for %s, which is neither an id nor a number, and asks nothing',
    async (url) => {
      await harness.navigateByUrl(url);

      expect(page()).toBe('not found');
      expect(asked).toEqual([]);
    },
  );

  it('shows not-found when the server cannot be asked', async () => {
    globalThis.fetch = () => Promise.reject(new TypeError('offline'));

    await harness.navigateByUrl('/play/41');

    expect(page()).toBe('not found');
  });
});
