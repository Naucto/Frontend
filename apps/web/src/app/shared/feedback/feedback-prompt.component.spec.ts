import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { client } from '@naucto/api-client';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuthStore } from '../../core/auth/auth.store';
import { FeaturesService } from '../../core/config/features.service';
import { testProviders } from '../../testing/providers';
import { FeedbackStore, PROMPT_AFTER_PLAY_MS } from './feedback.store';
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
  let eligible: boolean;

  const show = async (url: string): Promise<void> => {
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
    TestBed.inject(FeedbackStore).notePlayEnded(42, PROMPT_AFTER_PLAY_MS);
    await TestBed.inject(Router).navigateByUrl(url);
  };

  const card = (): Promise<HTMLElement> => screen.findByRole('region', { name: 'Feedback' });

  beforeEach(() => {
    sent = [];
    eligible = true;
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input);
      const path = new URL(request.url).pathname;
      const text = await request.text();
      sent.push({ method: request.method, path, body: text ? JSON.parse(text) : null });
      const body =
        path === '/feedback/ratings'
          ? { id: 5 }
          : { eligible: request.method === 'GET' ? eligible : false, declined: true };
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

  it('asks on the hub once a play has ended', async () => {
    await show('/hub');

    expect(await card()).toBeTruthy();
    expect(screen.getByText('How is Naucto so far?')).toBeTruthy();
  });

  it('never asks an account the server says is done', async () => {
    eligible = false;
    await show('/hub');
    await TestBed.inject(Router).navigateByUrl('/games');
    await TestBed.inject(Router).navigateByUrl('/hub');

    expect(screen.queryByRole('region', { name: 'Feedback' })).toBeNull();
  });

  it('sends a score on its own, then thanks', async () => {
    await show('/hub');
    await card();

    await userEvent.click(screen.getByRole('radio', { name: '9' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Thanks, we read every one.')).toBeTruthy();
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

    await screen.findByText('Thanks, we read every one.');
    const rating = sent.find((request) => request.path === '/feedback/ratings');
    expect(rating?.body).toMatchObject({
      score: 3,
      reasons: ['PERFORMANCE'],
      improve: 'Loading takes ages',
      liked: 'The palette',
    });
  });

  it('stops asking for good when told to', async () => {
    await show('/hub');
    await card();

    await userEvent.click(screen.getByRole('button', { name: "Don't ask again" }));

    expect(screen.queryByRole('region', { name: 'Feedback' })).toBeNull();
    expect(sent).toContainEqual({
      method: 'PUT',
      path: '/feedback/prompt',
      body: { action: 'decline' },
    });
  });

  it('asks again later when closed', async () => {
    await show('/hub');
    await card();

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(screen.queryByRole('region', { name: 'Feedback' })).toBeNull();
    expect(sent).toContainEqual({
      method: 'PUT',
      path: '/feedback/prompt',
      body: { action: 'snooze' },
    });
  });
});
