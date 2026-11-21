import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { client } from '@naucto/api-client';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testProviders } from '../../testing/providers';
import { CollectionDialogComponent, type CollectionDialogData } from './collection.dialog';

const realFetch = globalThis.fetch;

interface Sent {
  method: string;
  path: string;
  json: Record<string, unknown>;
}

describe('CollectionDialogComponent', () => {
  let sent: Sent[];
  let answer: { status: number; body: unknown };
  const close = vi.fn();

  const open = async (data: CollectionDialogData = {}): Promise<void> => {
    await render(CollectionDialogComponent, {
      providers: [
        ...testProviders(),
        { provide: DialogRef, useValue: { close } },
        { provide: DIALOG_DATA, useValue: data },
      ],
    });
  };

  beforeEach(() => {
    sent = [];
    answer = { status: 201, body: { id: 'new', title: 'Late night picks' } };
    close.mockReset();
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input);
      sent.push({
        method: request.method,
        path: new URL(request.url).pathname,
        json: (await request.json()) as Record<string, unknown>,
      });
      return new Response(JSON.stringify(answer.body), {
        status: answer.status,
        headers: { 'content-type': 'application/json' },
      });
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('creates a private collection unless told otherwise, and closes with it', async () => {
    await open();
    expect(screen.getByRole('radio', { name: 'Private' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByTestId('visibility-hint').textContent).toContain('Only you can see it.');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Create' }).disabled).toBe(true);

    await userEvent.type(screen.getByLabelText('Title'), '  Late night picks ');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledWith({ id: 'new', title: 'Late night picks' });
    });
    expect(sent).toEqual([
      {
        method: 'POST',
        path: '/collections',
        json: { title: 'Late night picks', description: null, visibility: 'PRIVATE' },
      },
    ]);
  });

  it('holds the title and the description to what the API takes', async () => {
    await open();
    expect(screen.getByLabelText('Title').getAttribute('maxlength')).toBe('40');
    expect(screen.getByLabelText('Description').getAttribute('maxlength')).toBe('280');
  });

  it('edits the collection it is given, and says what the chosen visibility means', async () => {
    answer = { status: 200, body: { id: 'abc', title: 'Couch co-op' } };
    await open({
      collection: {
        id: 'abc',
        title: 'Couch co-op',
        description: 'Two pads.',
        visibility: 'PUBLIC',
      },
    });
    expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe('Couch co-op');

    await userEvent.click(screen.getByRole('radio', { name: 'Unlisted' }));
    expect(screen.getByTestId('visibility-hint').textContent).toContain('have the link');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => {
      expect(close).toHaveBeenCalled();
    });
    expect(sent).toEqual([
      {
        method: 'PATCH',
        path: '/collections/abc',
        json: { title: 'Couch co-op', description: 'Two pads.', visibility: 'UNLISTED' },
      },
    ]);
  });

  it('says how many collections an account holds when the limit refuses one more', async () => {
    answer = {
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        code: 'COLLECTIONS_LIMIT',
        message: '',
        max: 50,
      },
    };
    await open();
    await userEvent.type(screen.getByLabelText('Title'), 'One too many');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect((await screen.findByRole('alert')).textContent).toContain('You already have 50');
    expect(close).not.toHaveBeenCalled();
  });
});
