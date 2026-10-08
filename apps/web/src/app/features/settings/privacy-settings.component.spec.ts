import { signal } from '@angular/core';
import { client, type UserAnalyticsSummaryDto } from '@naucto/api-client';
import { DialogService } from '@naucto/ui';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';

import { BrowserAccountService } from '../../core/analytics/browser-account.service';
import { FeaturesService } from '../../core/config/features.service';
import { testProviders } from '../../testing/providers';
import { PrivacySettingsComponent } from './privacy-settings.component';

const SUMMARY: UserAnalyticsSummaryDto = {
  tracked: true,
  linkedBrowsers: 2,
  lifetime: { plays: 14, playtimeMs: (3 * 60 + 12) * 60_000 },
  thisMonth: { plays: 3, playtimeMs: 45 * 60_000 },
  gamesPlayed: 4,
  topGames: [
    { releaseId: 7, name: 'Ferry Click', plays: 9, playtimeMs: 2 * 3_600_000 },
    { releaseId: 8, name: null, plays: 1, playtimeMs: 60_000 },
  ],
  lastActiveAt: '2026-10-01T10:00:00.000Z',
  lastActiveIsExact: true,
};

const realFetch = globalThis.fetch;
let requests: string[];

const serve = (summary: UserAnalyticsSummaryDto): void => {
  globalThis.fetch = (async (request: Request) => {
    requests.push(`${request.method} ${new URL(request.url).pathname}`);
    const body = request.method === 'DELETE' ? { erasedBrowsers: 2 } : summary;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
};

const mount = async (analytics: boolean): Promise<{ afterErase: ReturnType<typeof vi.fn> }> => {
  const afterErase = vi.fn(async () => undefined);
  await render(PrivacySettingsComponent, {
    providers: [
      ...testProviders(),
      { provide: FeaturesService, useValue: { analytics: signal(analytics) } },
      { provide: BrowserAccountService, useValue: { afterErase } },
      { provide: DialogService, useValue: { open: () => ({ closed: of(true) }) } },
    ],
  });
  return { afterErase };
};

describe('PrivacySettingsComponent', () => {
  beforeEach(() => {
    requests = [];
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('shows what was counted for the account', async () => {
    serve(SUMMARY);
    await mount(true);

    expect(await screen.findByText('3 h 12 min in all, 45 min this month')).toBeInTheDocument();
    expect(screen.getByText('14 in all, 3 this month')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ferry Click' })).toHaveAttribute('href', '/play/7');
    expect(screen.getByText('A deleted game')).toBeInTheDocument();
    expect(screen.getByText('2 h')).toBeInTheDocument();
  });

  it('says when nothing was counted', async () => {
    serve({ ...SUMMARY, tracked: false, linkedBrowsers: 0, topGames: [] });
    await mount(true);

    expect(await screen.findByText(/Nothing has been counted/)).toBeInTheDocument();
  });

  it('keeps the history and its controls with analytics off, without the choice', async () => {
    serve(SUMMARY);
    await mount(false);

    expect(await screen.findByText('Linked browsers')).toBeInTheDocument();
    expect(screen.queryByText('Usage analytics')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erase' })).toBeInTheDocument();
  });

  it('erases once confirmed, then starts the browser afresh', async () => {
    serve(SUMMARY);
    const { afterErase } = await mount(true);

    await userEvent.click(await screen.findByRole('button', { name: 'Erase' }));

    await vi.waitFor(() => {
      expect(afterErase).toHaveBeenCalled();
    });
    expect(requests).toContain('DELETE /users/me/analytics');
  });
});
