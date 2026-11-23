import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { client } from '@naucto/api-client';
import { uuidOf } from '@naucto/api-client/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testProviders } from '../../testing/providers';
import { BugReportDialog, categoryFor, subjectOf } from './bug-report.dialog';

const realFetch = globalThis.fetch;

interface Sent {
  method: string;
  path: string;
  json: Record<string, unknown>;
}

/** Opens the list under a field and takes the option of that name. */
async function pick(field: string, option: string): Promise<void> {
  await userEvent.click(await screen.findByRole('combobox', { name: field }));
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

describe('BugReportDialog', () => {
  let sent: Sent[];
  const close = vi.fn();

  const open = async (data: unknown = null): Promise<void> => {
    await render(BugReportDialog, {
      providers: [
        ...testProviders(),
        { provide: DialogRef, useValue: { close } },
        { provide: DIALOG_DATA, useValue: data },
      ],
    });
  };

  beforeEach(() => {
    sent = [];
    close.mockReset();
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input);
      const path = new URL(request.url).pathname;
      sent.push({
        method: request.method,
        path,
        json: (await request.json()) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({ id: uuidOf(12) }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const fill = async (): Promise<void> => {
    await userEvent.type(await screen.findByLabelText('Summary'), 'No music');
    await userEvent.type(screen.getByLabelText('What happened?'), 'The song never starts.');
  };

  it('reads the game or project a page is about, and the likely category', () => {
    expect(subjectOf(`/play/${uuidOf(42)}`)).toEqual({ releaseId: uuidOf(42) });
    expect(subjectOf(`/edit/${uuidOf(7)}/code`)).toEqual({ projectId: uuidOf(7) });
    expect(subjectOf('/hub')).toEqual({});
    expect(subjectOf('/play/42')).toEqual({});
    expect(subjectOf(`/edit/${uuidOf(7)}0/code`)).toEqual({});
    expect(categoryFor(`/edit/${uuidOf(7)}/code`)).toBe('EDITOR');
    expect(categoryFor(`/play/${uuidOf(42)}`)).toBe('GAMEPLAY');
    expect(categoryFor('/hub')).toBe('OTHER');
  });

  it('sends only once a summary and a description are written', async () => {
    await open();

    const send = await screen.findByRole('button', { name: 'Send report' });
    expect(send).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Summary'), 'Jump sticks');
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('What happened?'), 'Pressing jump twice freezes.');
    expect(send).toBeEnabled();
  });

  it('sends the report as JSON with the context it lists, and closes with its id', async () => {
    await open({ category: 'SOUND', ratingId: uuidOf(5) });
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));

    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledWith({ id: uuidOf(12), screenshotRefused: false });
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.json).toMatchObject({
      category: 'SOUND',
      title: 'No music',
      description: 'The song never starts.',
      route: '/',
      ratingId: uuidOf(5),
      appRelease: 'dev',
    });
    expect(Object.keys(sent[0]?.json.context ?? {}).sort()).toEqual(['language', 'viewport']);
    expect(screen.getByText('Included with your report')).toBeTruthy();
  });

  it('starts from what the page already knows', async () => {
    await open({ description: 'Loading takes ages' });

    expect(await screen.findByLabelText('What happened?')).toHaveValue('Loading takes ages');
    expect(screen.getByRole('combobox', { name: 'What is it about?' })).toHaveTextContent('Other');
  });

  it('sends the category picked from the list', async () => {
    await open();

    await pick('What is it about?', 'Multiplayer');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));

    await vi.waitFor(() => {
      expect(sent[0]?.json.category).toBe('NETPLAY');
    });
  });
});
