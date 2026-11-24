import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { client, type NotificationPayloadDto } from '@naucto/api-client';
import { uuidOf } from '@naucto/api-client/testing';
import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../../core/auth/auth.store';
import { NotificationsStore } from '../../core/notifications/notifications.store';
import { testProviders } from '../../testing/providers';
import { NotificationsBellComponent } from './notifications-bell.component';

const realFetch = globalThis.fetch;

const notification = (patch: Partial<NotificationPayloadDto>): NotificationPayloadDto => ({
  id: uuidOf(71),
  userId: uuidOf(1),
  title: 'High Tide',
  message: 'theo invited you to play High Tide',
  type: 'INFO',
  kind: 'GENERIC',
  data: null,
  read: false,
  createdAt: new Date().toISOString(),
  ...patch,
});

describe('NotificationsBellComponent', () => {
  const items = signal<NotificationPayloadDto[]>([]);
  const markRead = vi.fn(() => Promise.resolve());
  const markAllRead = vi.fn(() => Promise.resolve());
  let asked: string[] = [];
  /** What `GET /friends/requests` answers: the requests still waiting. */
  let waiting: unknown[] = [];

  const open = async (): Promise<Router> => {
    const view = await render(NotificationsBellComponent, {
      providers: [
        ...testProviders(),
        { provide: AuthStore, useValue: { userId: () => uuidOf(1) } },
        {
          provide: NotificationsStore,
          useValue: {
            items,
            unread: () => items().filter((item) => !item.read).length,
            markRead,
            markAllRead,
          },
        },
      ],
    });
    const router = view.fixture.debugElement.injector.get(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    return router;
  };

  beforeEach(() => {
    items.set([]);
    markRead.mockClear();
    markAllRead.mockClear();
    asked = [];
    waiting = [];
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input, init);
      const path = new URL(request.url).pathname;
      asked.push(`${request.method} ${path}`);
      return Promise.resolve(
        new Response(JSON.stringify(path === '/friends/requests' ? waiting : {}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('counts what is unread on the bell and in the panel, and says so when there is nothing', async () => {
    await open();
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toHaveTextContent('All clear');
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();

    items.set([notification({}), notification({ id: uuidOf(72), read: true })]);

    expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(markAllRead).toHaveBeenCalledOnce();
  });

  it('opens the game of a session invite on the session, with its code', async () => {
    items.set([
      notification({ data: { projectId: uuidOf(4), sessionId: 'room-1', joinCode: 'WXYZ' } }),
    ]);
    const router = await open();

    await userEvent.click(screen.getByRole('button', { name: /invited you to play/ }));

    expect(markRead).toHaveBeenCalledWith(uuidOf(71));
    expect(router.navigate).toHaveBeenCalledWith(['/play', uuidOf(4)], {
      queryParams: { session: 'room-1', code: 'WXYZ' },
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('answers a friend request that still waits from its row, and reads it', async () => {
    items.set([
      notification({
        id: uuidOf(77),
        kind: 'FRIEND_REQUEST',
        title: 'New friend request',
        message: 'lea wants to be your friend',
        data: { requestId: uuidOf(31), fromUserId: uuidOf(21) },
      }),
    ]);
    waiting = [
      {
        id: uuidOf(31),
        from: { id: uuidOf(21), username: 'lea' },
        to: { id: uuidOf(1), username: 'alexis' },
      },
      {
        id: uuidOf(32),
        from: { id: uuidOf(1), username: 'alexis' },
        to: { id: uuidOf(22), username: 'theo' },
      },
    ];
    await open();

    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    await waitFor(() => {
      expect(markRead).toHaveBeenCalledWith(uuidOf(77));
    });
    expect(asked).toContain(`POST /friends/requests/${uuidOf(31)}/accept`);
  });

  it('offers no answer to a request that was already answered', async () => {
    items.set([
      notification({
        kind: 'FRIEND_REQUEST',
        data: { requestId: uuidOf(31), fromUserId: uuidOf(21) },
      }),
    ]);
    await open();

    await waitFor(() => {
      expect(asked).toContain('GET /friends/requests');
    });
    const panel = within(screen.getByRole('dialog', { name: 'Notifications' }));
    expect(panel.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(panel.queryByRole('button', { name: 'Ignore' })).toBeNull();
  });
});
