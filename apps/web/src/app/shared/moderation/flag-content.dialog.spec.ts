import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { client } from '@naucto/api-client';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testProviders } from '../../testing/providers';
import { type FlagContentData, FlagContentDialog } from './flag-content.dialog';

const realFetch = globalThis.fetch;

const COMMENT: FlagContentData = { targetType: 'COMMENT', targetId: 7, label: 'buy cheap coins' };

describe('FlagContentDialog', () => {
  let sent: { path: string; json: Record<string, unknown> }[];
  let answer: () => Response;
  const close = vi.fn();

  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const open = async (data: FlagContentData = COMMENT): Promise<void> => {
    await render(FlagContentDialog, {
      providers: [
        ...testProviders(),
        { provide: DialogRef, useValue: { close } },
        { provide: DIALOG_DATA, useValue: data },
      ],
    });
  };

  beforeEach(() => {
    sent = [];
    answer = () => json(201, { id: 3 });
    close.mockReset();
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input);
      sent.push({
        path: new URL(request.url).pathname,
        json: (await request.json()) as Record<string, unknown>,
      });
      return answer();
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('names what is reported and sends only once a reason is chosen', async () => {
    await open();

    expect(await screen.findByText('Report this comment')).toBeTruthy();
    expect(screen.getByText('buy cheap coins')).toBeTruthy();
    const send = screen.getByRole('button', { name: 'Send report' });
    expect(send).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText('What is wrong with it?'), 'SPAM');
    expect(send).toBeEnabled();
  });

  it('sends the target, the reason and the trimmed details, and closes as sent', async () => {
    await open();
    await userEvent.selectOptions(await screen.findByLabelText('What is wrong with it?'), 'SPAM');
    await userEvent.type(
      screen.getByLabelText('Anything the moderators should know'),
      '  Third time today  ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));

    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledWith(true);
    });
    expect(sent).toEqual([
      {
        path: '/moderation/flags',
        json: { targetType: 'COMMENT', targetId: 7, reason: 'SPAM', details: 'Third time today' },
      },
    ]);
  });

  it('leaves the details out when nothing was written', async () => {
    await open({ targetType: 'USER', targetId: 4, label: '@bob' });
    await userEvent.selectOptions(await screen.findByLabelText('What is wrong with it?'), 'HATE');
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));

    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledWith(true);
    });
    expect(sent[0]?.json).toEqual({ targetType: 'USER', targetId: 4, reason: 'HATE' });
  });

  it.each([
    ['ALREADY_FLAGGED', 'You already reported this, and a moderator has not looked at it yet.'],
    ['CANNOT_FLAG_OWN_CONTENT', 'This is yours, so there is nothing to report.'],
    ['SOMETHING_NEW', 'The report could not be sent. Try again in a moment.'],
  ])('answers a %s refusal in its own words and stays open', async (code, message) => {
    answer = () => json(409, { code, message: 'refused' });
    await open();
    await userEvent.selectOptions(await screen.findByLabelText('What is wrong with it?'), 'SPAM');
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
  });
});
