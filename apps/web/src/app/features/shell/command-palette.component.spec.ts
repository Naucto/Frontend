import { DialogRef } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { client } from '@naucto/api-client';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../../core/auth/auth.store';
import { ThemeService } from '../../core/theme/theme.service';
import { FeedbackLauncher } from '../../shared/feedback/feedback-launcher.service';
import { testProviders } from '../../testing/providers';
import { CommandPaletteComponent } from './command-palette.component';

const realFetch = globalThis.fetch;

describe('CommandPaletteComponent', () => {
  const close = vi.fn();
  const toggle = vi.fn();
  const reportBug = vi.fn();
  const user = signal<{ username: string } | null>(null);

  const open = async (): Promise<Router> => {
    const view = await render(CommandPaletteComponent, {
      providers: [
        ...testProviders(),
        { provide: DialogRef, useValue: { close } },
        {
          provide: AuthStore,
          useValue: { user, isAuthenticated: () => user() !== null, logout: vi.fn() },
        },
        { provide: ThemeService, useValue: { effective: signal('dark'), toggle } },
        { provide: FeedbackLauncher, useValue: { reportBug, rate: vi.fn() } },
      ],
    });
    const router = view.fixture.debugElement.injector.get(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    return router;
  };

  const options = (): string[] =>
    screen.getAllByRole('option').map((option) => option.textContent.trim());
  const lit = (): string => screen.getByRole('option', { selected: true }).textContent.trim();

  beforeEach(() => {
    close.mockReset();
    toggle.mockReset();
    reportBug.mockReset();
    user.set(null);
    // jsdom lays nothing out, so it has nothing to scroll.
    Element.prototype.scrollIntoView = vi.fn();
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      const projects = path.endsWith('/projects/releases/paginated')
        ? [{ id: 7, name: 'Theme Park Tycoon', creator: { username: 'lena' } }]
        : [{ id: 3, name: 'Night Survivors' }];
      return Promise.resolve(
        new Response(JSON.stringify({ projects, total: 1, page: 1, limit: 3 }), {
          status: path.includes('/projects') ? 200 : 404,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('offers a visitor only what a visitor can do, and no games before a word is typed', async () => {
    await open();

    expect(options()).toEqual([
      'Hub',
      'Collections',
      'Learn',
      'Toggle theme',
      'Report a problem',
      'Send feedback',
      'Sign in',
    ]);
    expect(screen.queryByRole('group', { name: 'Recent' })).toBeNull();
  });

  it('leads with the games edited last, and ENTER opens the lit one in the editor', async () => {
    user.set({ username: 'alexis' });
    const router = await open();

    expect(await screen.findByRole('group', { name: 'Recent' })).toBeTruthy();
    expect(options()).toEqual(expect.arrayContaining(['My games', 'New game', 'Sign out']));
    expect(options()).not.toContain('Sign in');
    expect(lit()).toContain('Night Survivors');

    // The dialog puts the caret in the field as it opens; nothing does here.
    screen.getByRole('combobox').focus();
    await userEvent.keyboard('{Enter}');

    expect(close).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/edit', 3]);
  });

  it('narrows games and actions by what is typed, walks them with the arrows and runs one', async () => {
    await open();

    await userEvent.type(screen.getByRole('combobox'), 'theme');

    expect(await screen.findByRole('group', { name: 'Games' })).toBeTruthy();
    expect(options()).toEqual([expect.stringContaining('Theme Park Tycoon'), 'Toggle theme']);
    expect(screen.getByRole('status')).toHaveTextContent('2 results');

    await userEvent.keyboard('{ArrowUp}');
    expect(lit()).toBe('Toggle theme');
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { selected: true }).id,
    );
    await userEvent.keyboard('{ArrowDown}');
    expect(lit()).toContain('Theme Park Tycoon');

    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(close).toHaveBeenCalledOnce();
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('runs the row that is clicked, and says so when nothing answers', async () => {
    await open();

    await userEvent.type(screen.getByRole('combobox'), 'zzz');
    expect(await screen.findByText('Nothing by that name.')).toBeTruthy();

    await userEvent.clear(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'Report a problem' }));

    expect(close).toHaveBeenCalledOnce();
    expect(reportBug).toHaveBeenCalledOnce();
  });
});
