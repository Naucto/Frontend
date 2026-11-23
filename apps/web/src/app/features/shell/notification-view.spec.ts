import { type NotificationPayloadDto } from '@naucto/api-client';
import { uuidOf } from '@naucto/api-client/testing';
import { describe, expect, it } from 'vitest';

import { destinationOf, lookOf } from './notification-view';

const notification = (patch: Partial<NotificationPayloadDto>): NotificationPayloadDto => ({
  id: uuidOf(71),
  userId: uuidOf(1),
  title: '',
  message: '',
  type: 'INFO',
  kind: 'GENERIC',
  data: null,
  read: false,
  createdAt: '2026-11-20T10:00:00.000Z',
  ...patch,
});

describe('destinationOf', () => {
  it('opens the game of a session invite on the session, with the code that lets one in', () => {
    const invite = notification({
      data: { projectId: uuidOf(4), sessionId: 'abc', joinCode: 'WXYZ' },
    });

    expect(destinationOf(invite)).toEqual({
      path: ['/play', uuidOf(4)],
      query: { session: 'abc', code: 'WXYZ' },
    });
  });

  it('leaves the code out of an invite to a session that has none', () => {
    const invite = notification({ data: { projectId: uuidOf(4), sessionId: 'abc' } });

    expect(destinationOf(invite)).toEqual({
      path: ['/play', uuidOf(4)],
      query: { session: 'abc' },
    });
  });

  it('opens a game that is only named, and leads nowhere without one', () => {
    expect(
      destinationOf(notification({ kind: 'FEATURED', data: { projectId: uuidOf(4) } })),
    ).toEqual({
      path: ['/play', uuidOf(4)],
    });
    expect(destinationOf(notification({}))).toBeNull();
  });

  it('leads nowhere from a project that is not named by an id', () => {
    expect(destinationOf(notification({ kind: 'FEATURED', data: { projectId: 4 } }))).toBeNull();
    expect(
      destinationOf(notification({ kind: 'COLLABORATOR_ADDED', data: { projectId: 9 } })),
    ).toBeNull();
  });

  it('sends both friend kinds to the friends page', () => {
    expect(destinationOf(notification({ kind: 'FRIEND_REQUEST' }))).toEqual({ path: ['/friends'] });
    expect(destinationOf(notification({ kind: 'FRIEND_ACCEPTED' }))).toEqual({
      path: ['/friends'],
    });
  });

  it('opens the editor of a project one was added to, and nothing of one they were removed from', () => {
    expect(
      destinationOf(notification({ kind: 'COLLABORATOR_ADDED', data: { projectId: uuidOf(9) } })),
    ).toEqual({ path: ['/edit', uuidOf(9)] });
    expect(
      destinationOf(notification({ kind: 'COLLABORATOR_REMOVED', data: { projectId: uuidOf(9) } })),
    ).toBeNull();
  });

  it('sends a moderation notice to the standing, never to the game it is about', () => {
    expect(
      destinationOf(notification({ kind: 'MODERATION', data: { projectId: uuidOf(9) } })),
    ).toEqual({
      path: ['/settings', 'standing'],
    });
  });
});

describe('lookOf', () => {
  it('draws a warning in orange whatever its kind', () => {
    expect(lookOf(notification({ type: 'WARNING', kind: 'FEATURED' }))).toEqual({
      tone: 'orange',
      icon: 'alert',
    });
  });

  it('keeps the flag of a moderation notice, which arrives as a warning', () => {
    expect(lookOf(notification({ type: 'WARNING', kind: 'MODERATION' }))).toEqual({
      tone: 'orange',
      icon: 'flag',
    });
  });

  it('tells a session invite from the other generic notifications', () => {
    expect(lookOf(notification({ data: { projectId: uuidOf(4), sessionId: 'abc' } })).icon).toBe(
      'gamepad',
    );
    expect(lookOf(notification({ data: { projectId: uuidOf(4) } })).icon).toBe('info-box');
  });

  it('gives each kind its accent', () => {
    expect(lookOf(notification({ kind: 'FRIEND_REQUEST' })).tone).toBe('jade');
    expect(lookOf(notification({ kind: 'FEATURED' })).tone).toBe('gold');
    expect(lookOf(notification({ kind: 'COLLABORATOR_ADDED' })).tone).toBe('sky');
  });
});
