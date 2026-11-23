import { client, type ProjectExResponseDto } from '@naucto/api-client';
import { render, screen } from '@testing-library/angular';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testProviders } from '../../testing/providers';
import { ReadOnlyBandComponent } from './read-only-band.component';
import type { PreviewKind } from './work-session/work-session.service';

const realFetch = globalThis.fetch;

const game = (state: Partial<ProjectExResponseDto> = {}): ProjectExResponseDto =>
  ({
    id: 7,
    name: 'Ferry Click',
    publishedAt: null,
    hiddenAt: null,
    creator: { id: 4, username: 'priax' },
    ...state,
  }) as ProjectExResponseDto;

describe('ReadOnlyBandComponent', () => {
  const show = async (kind: PreviewKind, project: ProjectExResponseDto | null): Promise<void> => {
    await render(ReadOnlyBandComponent, {
      providers: testProviders(),
      inputs: { kind, project },
    });
  };

  beforeEach(() => {
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    // The maker's avatar asks for their picture; none is the answer that keeps the initial.
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { profileImageUrl: null } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it.each([
    [
      { hiddenAt: '2026-11-02T10:00:00.000Z', publishedAt: '2026-10-01T10:00:00.000Z' },
      'Hidden by moderation',
    ],
    [{ publishedAt: null }, 'Not published'],
    [{ publishedAt: '2026-10-01T10:00:00.000Z' }, 'Published'],
  ])('tells a staff member what the game is: %o reads %s', async (state, words) => {
    await show('staff', game(state));

    expect(screen.getByTestId('read-only-state').textContent.trim()).toBe(words);
    expect(screen.getByTestId('read-only-band').textContent).toContain(
      'Staff view of the latest save',
    );
  });

  it('names who made the game, the name leading to their profile', async () => {
    await show('staff', game());

    const maker = screen.getByRole('link', { name: 'by priax' });
    expect(maker.getAttribute('href')).toBe('/u/priax');
    expect(screen.getByRole('img', { name: 'priax' })).toBeTruthy();
  });

  it('says only why nothing can be changed until the game is loaded', async () => {
    await show('staff', null);

    expect(screen.queryByTestId('read-only-state')).toBeNull();
    expect(screen.getByTestId('read-only-band').textContent).toContain(
      'Staff view of the latest save',
    );
  });

  it('keeps the band of a suspended owner on their own game as it was: no state, no maker', async () => {
    await show('own', game({ hiddenAt: '2026-11-02T10:00:00.000Z' }));

    expect(screen.queryByTestId('read-only-state')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByTestId('read-only-band').textContent).toContain(
      'Nothing in it can be changed while your account is suspended',
    );
  });
});
