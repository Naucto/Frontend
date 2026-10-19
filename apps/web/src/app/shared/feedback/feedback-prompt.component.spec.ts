import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { client } from '@naucto/api-client';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../../core/auth/auth.store';
import { FeaturesService } from '../../core/config/features.service';
import { testProviders } from '../../testing/providers';
import { FeedbackStore, PROMPT_AFTER_BUILD_MS, PROMPT_AFTER_PLAY_MS } from './feedback.store';
import { FeedbackPromptComponent, promptFits } from './feedback-prompt.component';

@Component({ template: '' })
class BlankPage {}

const ROUTES = [
  { path: 'hub', component: BlankPage },
  { path: 'play/:id', component: BlankPage },
  { path: 'games', component: BlankPage },
];

interface Sent {
  method: string;
  path: string;
  body: unknown;
}

const realFetch = globalThis.fetch;

describe('FeedbackPromptComponent', () => {
  let sent: Sent[];
  let playerEligible: boolean;

  const show = async (url: string, arm: 'play' | 'build' = 'play'): Promise<void> => {
    await render(FeedbackPromptComponent, {
      providers: [
        ...testProviders(ROUTES),
        {
          provide: FeaturesService,
          useValue: { feedback: signal(true), analytics: signal(false) },
        },
        { provide: AuthStore, useValue: { isAuthenticated: signal(true) } },
      ],
    });
    const store = TestBed.inject(FeedbackStore);
    if (arm === 'play') {
      store.notePlayEnded(42, PROMPT_AFTER_PLAY_MS);
    } else {
      store.noteEditorLeft(PROMPT_AFTER_BUILD_MS);
    }
    await TestBed.inject(Router).navigateByUrl(url);
  };

  const card = (): Promise<HTMLElement> => screen.findByRole('dialog', { name: 'Feedback' });
  const noCard = (): void => {
    expect(screen.queryByRole('dialog', { name: 'Feedback' })).toBeNull();
  };

  beforeEach(() => {
    sent = [];
    playerEligible = true;
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input);
      const path = new URL(request.url).pathname;
      const text = await request.text();
      sent.push({ method: request.method, path, body: text ? JSON.parse(text) : null });
      const body =
        path === '/feedback/ratings'
          ? { id: 5 }
          : {
              player: { eligible: playerEligible, declined: false },
              creator: { eligible: true, declined: false },
            };
      return new Response(JSON.stringify(body), {
        status: path === '/feedback/ratings' ? 201 : 200,
        headers: { 'content-type': 'application/json' },
      });
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('waits for the hub after a play, and stays out of games and the editor', () => {
    expect(promptFits('PLAYER', '/hub')).toBe(true);
    expect(promptFits('PLAYER', '/games')).toBe(false);
    expect(promptFits('PLAYER', '/play/42')).toBe(false);
    expect(promptFits('CREATOR', '/games')).toBe(true);
    expect(promptFits('CREATOR', '/edit/3/code')).toBe(false);
  });

  it('asks in the middle of the hub once a play has ended, and Escape does not skip it', async () => {
    await show('/hub');

    expect(await card()).toBeTruthy();
    expect(screen.getByText('How is Naucto so far?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Feedback' })).not.toBeNull();
  });

  it('still asks a creator who already answered as a player', async () => {
    playerEligible = false;
    await show('/hub');
    await TestBed.inject(Router).navigateByUrl('/games');
    noCard();

    TestBed.inject(FeedbackStore).noteEditorLeft(PROMPT_AFTER_BUILD_MS);
    expect(await card()).toBeTruthy();
    expect(screen.getByText('How is making games on Naucto?')).toBeTruthy();
  });

  it('never asks a player the server says is done', async () => {
    playerEligible = false;
    await show('/hub');
    await TestBed.inject(Router).navigateByUrl('/games');
    await TestBed.inject(Router).navigateByUrl('/hub');

    noCard();
  });

  it('sends a score on its own, then closes', async () => {
    await show('/hub');
    await card();

    await userEvent.click(screen.getByRole('radio', { name: '9' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await vi.waitFor(noCard);
    const rating = sent.find((request) => request.path === '/feedback/ratings');
    expect(rating?.body).toEqual({
      score: 9,
      context: 'PLAYER',
      source: 'PROMPT',
      releaseId: 42,
    });
  });

  it('asks why for a low score, and sends the reasons and both comments', async () => {
    await show('/hub');
    await card();

    await userEvent.click(screen.getByRole('radio', { name: '3' }));
    expect(screen.getByText('What went wrong?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Report a bug' })).toBeTruthy();

    await userEvent.click(screen.getByRole('switch', { name: 'Slow' }));
    await userEvent.type(screen.getByLabelText('Tell us why'), 'Loading takes ages');
    await userEvent.type(screen.getByLabelText('What did you like?'), 'The palette');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await vi.waitFor(noCard);
    const rating = sent.find((request) => request.path === '/feedback/ratings');
    expect(rating?.body).toMatchObject({
      score: 3,
      reasons: ['PERFORMANCE'],
      improve: 'Loading takes ages',
      liked: 'The palette',
    });
  });

  it('stops asking for good in that context when told to', async () => {
    await show('/games', 'build');
    await card();

    await userEvent.click(screen.getByRole('button', { name: "Don't ask again" }));

    await vi.waitFor(noCard);
    expect(sent).toContainEqual({
      method: 'PUT',
      path: '/feedback/prompt',
      body: { action: 'decline', context: 'CREATOR' },
    });
  });

  it('asks again later when put off', async () => {
    await show('/hub');
    await card();

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));

    await vi.waitFor(noCard);
    expect(sent).toContainEqual({
      method: 'PUT',
      path: '/feedback/prompt',
      body: { action: 'snooze', context: 'PLAYER' },
    });
  });
});
