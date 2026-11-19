import { signal } from '@angular/core';
import { client } from '@naucto/api-client';
import { render, screen } from '@testing-library/angular';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuthStore } from '../../core/auth/auth.store';
import { testProviders } from '../../testing/providers';
import { StandingSettingsComponent } from './standing-settings.component';

const realFetch = globalThis.fetch;

const entry = (id: number, changes: Record<string, unknown>): Record<string, unknown> => ({
  id,
  action: 'COMMENT_HIDDEN',
  targetType: 'COMMENT',
  targetId: id,
  targetLabel: null,
  reason: null,
  message: null,
  expiresAt: null,
  createdAt: '2026-11-10T12:00:00.000Z',
  ...changes,
});

describe('StandingSettingsComponent', () => {
  let standing: Record<string, unknown>;
  let asked: string[];

  const open = async (): Promise<void> => {
    await render(StandingSettingsComponent, {
      providers: [
        ...testProviders(),
        { provide: AuthStore, useValue: { isAuthenticated: signal(true) } },
      ],
    });
  };

  beforeEach(() => {
    asked = [];
    standing = { suspension: null, warnings: 0, items: [], total: 0, page: 1, limit: 10 };
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input);
      asked.push(new URL(request.url).pathname + new URL(request.url).search);
      return Promise.resolve(
        new Response(JSON.stringify(standing), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('says an account with nothing on record is in good standing', async () => {
    await open();

    expect(
      await screen.findByText('Nothing on record. Your account is in good standing.'),
    ).toBeTruthy();
    expect(asked).toEqual(['/moderation/standing?page=1&limit=10']);
  });

  it('lists each decision with its reason, what it was about and what staff said', async () => {
    standing = {
      ...standing,
      warnings: 2,
      total: 2,
      items: [
        entry(2, {
          targetLabel: 'buy cheap coins',
          reason: 'SPAM',
          message: 'Advertising is not allowed in comments.',
        }),
        entry(1, { action: 'ACCOUNT_WARNED', targetType: 'USER', targetLabel: 'alice' }),
      ],
    };
    await open();

    expect(await screen.findByText('Comment removed')).toBeTruthy();
    expect(screen.getByText('Spam or advertising')).toBeTruthy();
    expect(screen.getByText('buy cheap coins')).toBeTruthy();
    expect(screen.getByText('Advertising is not allowed in comments.')).toBeTruthy();
    expect(screen.getByText('Warning')).toBeTruthy();
    expect(screen.getByText('2 warnings')).toBeTruthy();
    expect(screen.queryByText('alice')).toBeNull();
  });

  it('puts the suspension first, with its reason and its message', async () => {
    standing = {
      ...standing,
      suspension: {
        since: '2026-11-10T12:00:00.000Z',
        until: null,
        reason: 'HARASSMENT',
        message: 'Second time this week.',
      },
    };
    await open();

    expect(await screen.findByText(/Your account is suspended\./)).toBeTruthy();
    expect(screen.getByText('Reason: Harassment or bullying')).toBeTruthy();
    expect(screen.getByText('Second time this week.')).toBeTruthy();
  });

  it('offers older decisions only when there are more than a page', async () => {
    await open();
    await screen.findByText('Nothing on record. Your account is in good standing.');
    expect(screen.queryByRole('button', { name: 'Older' })).toBeNull();
  });
});
