import { type FriendDto, type PresenceDto } from '@naucto/api-client';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { render, screen, within } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import { AuthStore } from '../../core/auth/auth.store';
import { PresenceStore } from '../../core/presence/presence.store';
import { qk } from '../../shared/queries/query-keys';
import { testProviders } from '../../testing/providers';
import FriendsPage from './friends.page';

function aFriend(id: number, username: string): FriendDto {
  return {
    id,
    username,
    nickname: null,
    since: '2026-10-22T12:00:00.000Z',
  };
}

function aPresence(userId: number, kind: PresenceDto['kind']): PresenceDto {
  return {
    userId,
    username: '',
    nickname: null,
    kind,
    releaseId: null,
    projectId: null,
    sessionId: null,
    title: kind === 'IDLE' ? null : 'Race',
    coverUrl: null,
    players: null,
    maxPlayers: null,
    joinable: false,
    since: '2026-10-22T12:00:00.000Z',
  };
}

async function renderWith(
  friends: FriendDto[],
  presences: Record<number, PresenceDto>,
): Promise<void> {
  const queries = new QueryClient();
  queries.setQueryData(qk.friends(), friends);
  await render(FriendsPage, {
    providers: [
      ...testProviders(),
      { provide: QueryClient, useValue: queries },
      { provide: AuthStore, useValue: { isAuthenticated: () => false, userId: () => 1 } },
      {
        provide: PresenceStore,
        useValue: { of: (id: number) => presences[id] ?? null, load: async () => undefined },
      },
    ],
  });
}

function section(label: string): HTMLElement {
  return screen.getByText(label).parentElement!;
}

describe('FriendsPage', () => {
  it('lists a friend who is connected but idle as online, not offline', async () => {
    await renderWith([aFriend(2, 'idler'), aFriend(3, 'gone')], { 2: aPresence(2, 'IDLE') });

    expect(within(section('Online now')).getByText('idler')).toBeTruthy();
    expect(within(section('Online now')).getByText('online')).toBeTruthy();
    expect(within(section('Online now')).queryByText('gone')).toBeNull();
  });

  it('puts friends doing something before idle ones', async () => {
    await renderWith([aFriend(2, 'idler'), aFriend(3, 'player')], {
      2: aPresence(2, 'IDLE'),
      3: aPresence(3, 'PLAYING'),
    });

    const names = within(section('Online now'))
      .getAllByRole('link')
      .map((link) => link.textContent?.trim())
      .filter((name) => name === 'idler' || name === 'player');
    expect(names).toEqual(['player', 'idler']);
  });

  it('says since when an offline friend has been a friend, not when they were last seen', async () => {
    await renderWith([aFriend(3, 'gone')], {});

    expect(screen.getByText(/friends since Oct 2026/)).toBeTruthy();
  });
});
