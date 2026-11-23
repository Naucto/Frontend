import { signal } from '@angular/core';
import { DeferBlockBehavior } from '@angular/core/testing';
import { Router } from '@angular/router';
import { client } from '@naucto/api-client';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../../core/auth/auth.store';
import { PresenceStore } from '../../core/presence/presence.store';
import { installLayoutStubs } from '../../shared/hub/testing';
import { testProviders } from '../../testing/providers';
import { SearchSuggestComponent } from './search-suggest.component';

const realFetch = globalThis.fetch;

const game = (id: number, name: string): Record<string, unknown> => ({
  id,
  name,
  viewCount: 1200,
  likes: 34,
  coverUrl: null,
  disk: null,
  creator: { id: 7, username: 'ada' },
});

describe('SearchSuggestComponent', () => {
  const user = signal<{ id: number } | null>(null);

  const mount = async (): Promise<Router> => {
    const view = await render(SearchSuggestComponent, {
      // The panel is deferred until the box is reached; let it load as it does in the app.
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
      providers: [
        ...testProviders(),
        { provide: AuthStore, useValue: { user } },
        { provide: PresenceStore, useValue: { of: () => null } },
      ],
    });
    const router = view.fixture.debugElement.injector.get(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    return router;
  };

  const box = (): HTMLElement => screen.getByRole('combobox');

  beforeEach(() => {
    installLayoutStubs();
    user.set(null);
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input);
      const typed = url.searchParams.get('search') ?? url.searchParams.get('q') ?? '';
      const answers: Record<string, unknown> = {
        '/projects/releases/paginated': {
          projects: typed
            ? [game(42, 'Cave Diver')].filter(() => typed.startsWith('ca'))
            : [game(1, 'Night Survivors'), game(2, 'Nova Blitz')],
          total: 2,
        },
        '/projects/releases/tags': {
          tags: typed.startsWith('ca') ? [{ tag: 'caves', count: 3 }] : [],
        },
        '/users/public/search': {
          data: typed.startsWith('ca') ? [{ id: 5, username: 'cavefan' }] : [],
        },
        '/game-sessions': {
          sessions: [
            {
              sessionUuid: 'room-1',
              projectId: 9,
              projectName: 'High Tide',
              hostId: 11,
              hostUsername: 'louis',
              playerCount: 2,
              maxPlayers: 4,
              coverUrl: null,
              disk: { color: '#3a7d44', finish: 'solid' },
            },
          ],
        },
      };
      const body = answers[url.pathname];
      return Promise.resolve(
        new Response(JSON.stringify(body ?? {}), {
          status: body ? 200 : 404,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('stays shut until the box is reached, then offers the most played games', async () => {
    await mount();

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box()).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(box());

    expect(await screen.findByRole('group', { name: 'Popular' })).toBeTruthy();
    const [first, second, ...others] = screen.getAllByRole('option');
    expect(first).toHaveAccessibleName('Night Survivors, 1200 plays, 34 likes');
    expect(second).toHaveAccessibleName('Nova Blitz, 1200 plays, 34 likes');
    expect(others).toEqual([]);
    expect(box()).toHaveAttribute('aria-expanded', 'true');
    expect(box()).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    expect(screen.getByRole('status')).toHaveTextContent('2 suggestions');
  });

  it('lists the open sessions to a signed-in player only, and opens the game on the session', async () => {
    user.set({ id: 1 });
    const router = await mount();

    await userEvent.click(box());
    const session = await screen.findByRole('option', {
      name: 'Join High Tide, hosted by louis, 2 of 4 players',
    });
    expect(
      session.querySelector<HTMLElement>('nc-floppy')?.style.getPropertyValue('--f-body'),
    ).toBe('#3a7d44');
    await userEvent.click(session);

    expect(router.navigate).toHaveBeenCalledWith(['/play', 9], {
      queryParams: { session: 'room-1' },
    });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('groups what the words find and walks it with the keyboard, into the list and back', async () => {
    await mount();

    await userEvent.type(box(), 'ca');
    expect(await screen.findByRole('group', { name: 'Games' })).toBeTruthy();
    const [first, second, last, ...others] = screen.getAllByRole('option');
    expect(first).toHaveAccessibleName('Cave Diver, 1200 plays, 34 likes');
    expect(second).toHaveAccessibleName('cavefan');
    expect(last).toHaveAccessibleName('#caves');
    expect(others).toEqual([]);

    await userEvent.keyboard('{ArrowDown}');
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    expect(first).toHaveAttribute('aria-selected', 'false');

    await userEvent.keyboard('{End}');
    expect(last).toHaveFocus();
    await userEvent.keyboard('{Tab}');
    expect(box()).toHaveFocus();

    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(last).toHaveFocus();
    await userEvent.keyboard('{Home}{ArrowUp}');
    expect(box()).toHaveFocus();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('returns to the box when a character is typed from the list', async () => {
    await mount();

    await userEvent.type(box(), 'ca');
    await screen.findByRole('group', { name: 'Games' });
    await userEvent.keyboard('{ArrowDown}v');

    expect(box()).toHaveFocus();
    expect(box()).toHaveValue('cav');
  });

  it('opens the option under the caret, and runs the search from the box', async () => {
    const router = await mount();

    await userEvent.type(box(), 'ca');
    await screen.findByRole('group', { name: 'Games' });
    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(router.navigate).toHaveBeenCalledWith(['/play', 42]);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box()).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(router.navigate).toHaveBeenLastCalledWith(['/hub'], { queryParams: { q: 'ca' } });
  });

  it('narrows to tags after a #, and ENTER lands on the first', async () => {
    const router = await mount();

    await userEvent.type(box(), '#ca');
    expect(await screen.findByRole('option', { name: '#caves' })).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(1);

    await userEvent.keyboard('{Enter}');
    expect(router.navigate).toHaveBeenCalledWith(['/hub'], {
      queryParams: { tags: 'caves', q: null },
    });
  });

  it('closes on Escape, then empties the box', async () => {
    await mount();

    await userEvent.type(box(), 'ca');
    await screen.findByRole('group', { name: 'Games' });

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box()).toHaveValue('ca');

    await userEvent.keyboard('{Escape}');
    expect(box()).toHaveValue('');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('says so when nothing matches', async () => {
    await mount();

    await userEvent.type(box(), 'zzz');

    expect(await screen.findByText('Nothing matches yet. Enter searches anyway.')).toBeTruthy();
    expect(screen.getByRole('status')).toHaveTextContent('No suggestions');
  });
});
