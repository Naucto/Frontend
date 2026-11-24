import { signal } from '@angular/core';
import { client } from '@naucto/api-client';
import { uuidOf } from '@naucto/api-client/testing';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../../core/auth/auth.store';
import { testProviders } from '../../testing/providers';
import { StandingSettingsComponent } from './standing-settings.component';

const realFetch = globalThis.fetch;

const entry = (number: number, changes: Record<string, unknown>): Record<string, unknown> => ({
  id: uuidOf(number),
  action: 'COMMENT_HIDDEN',
  targetType: 'COMMENT',
  targetId: uuidOf(number),
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

    const removed = within(await screen.findByRole('row', { name: /Comment removed/ }));
    expect(removed.getByRole('rowheader').textContent).toContain('buy cheap coins');
    expect(removed.getByText('Spam or advertising')).toBeTruthy();
    expect(removed.getByText('Advertising is not allowed in comments.')).toBeTruthy();
    expect(removed.getByText(/Nov 10, 2026/)).toBeTruthy();
    expect(screen.getByRole('row', { name: /Warning/ })).toBeTruthy();
    expect(screen.getByText('2 warnings')).toBeTruthy();
    expect(screen.queryByText('alice')).toBeNull();
  });

  it('names what was decided about a collection, and reads a restore as good news', async () => {
    const collection = { targetType: 'COLLECTION', targetLabel: 'Couch co-op' };
    standing = {
      ...standing,
      total: 3,
      items: [
        entry(3, { ...collection, action: 'COLLECTION_RESTORED' }),
        entry(2, { ...collection, action: 'COLLECTION_HIDDEN', reason: 'STOLEN_CONTENT' }),
        entry(1, { ...collection, action: 'COLLECTION_DELETED' }),
      ],
    };
    await open();

    const hidden = within(await screen.findByRole('row', { name: /Collection hidden/ }));
    expect(hidden.getByRole('rowheader').textContent).toContain('Couch co-op');
    expect(hidden.getByText('Stolen work')).toBeTruthy();
    expect(screen.getByRole('row', { name: /Collection restored/ })).toBeTruthy();
    expect(screen.getByRole('row', { name: /Collection deleted/ })).toBeTruthy();
    expect(screen.queryByText('Decision', { selector: 'nc-chip' })).toBeNull();
  });

  it('heads the table with what each column holds', async () => {
    standing = { ...standing, total: 1, items: [entry(1, {})] };
    await open();

    await screen.findByRole('table');
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent.trim())).toEqual([
      'Decision',
      'Reason',
      'Message',
      'Date',
    ]);
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

    expect(await screen.findByText('Your account is suspended.')).toBeTruthy();
    expect(screen.getByText('Reason').nextElementSibling?.textContent).toBe(
      'Harassment or bullying',
    );
    expect(screen.getByText('Second time this week.')).toBeTruthy();
  });

  it('dates a suspension that ends as the decisions are dated', async () => {
    standing = {
      ...standing,
      suspension: { since: '2026-11-10T12:00:00.000Z', until: '2026-12-04T12:00:00.000Z' },
    };
    await open();

    expect(await screen.findByText(/^Your account is suspended until Dec 4, 2026, /)).toBeTruthy();
  });

  it('offers older decisions only when there are more than a page', async () => {
    await open();
    await screen.findByText('Nothing on record. Your account is in good standing.');
    expect(screen.queryByRole('button', { name: 'Older' })).toBeNull();
  });

  it('pages through the decisions with the pager, a dot a page', async () => {
    standing = { ...standing, total: 23, items: [entry(23, {})] };
    await open();

    await screen.findByRole('table');
    expect(screen.getAllByRole('tab').map((dot) => dot.getAttribute('aria-label'))).toEqual([
      'Page 1',
      'Page 2',
      'Page 3',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Older' }));

    await vi.waitFor(() => {
      expect(asked).toEqual([
        '/moderation/standing?page=1&limit=10',
        '/moderation/standing?page=2&limit=10',
      ]);
    });
    expect(screen.getByRole('tab', { name: 'Page 2' }).getAttribute('aria-selected')).toBe('true');
  });
});
