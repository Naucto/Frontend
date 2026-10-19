import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { client } from '@naucto/api-client';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testProviders } from '../../testing/providers';
import { BugReportDialog, categoryFor, subjectOf } from './bug-report.dialog';

const realFetch = globalThis.fetch;

describe('BugReportDialog', () => {
  let form: FormData | null;
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
    form = null;
    close.mockReset();
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input);
      form = await request.formData();
      return new Response(JSON.stringify({ id: 12 }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('reads the game or project a page is about, and the likely category', () => {
    expect(subjectOf('/play/42')).toEqual({ releaseId: 42 });
    expect(subjectOf('/edit/7/code')).toEqual({ projectId: 7 });
    expect(subjectOf('/hub')).toEqual({});
    expect(categoryFor('/edit/7/code')).toBe('EDITOR');
    expect(categoryFor('/play/42')).toBe('GAMEPLAY');
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

  it('sends the report as a form with the context it lists, and closes with its id', async () => {
    await open({ category: 'SOUND', ratingId: 5 });

    await userEvent.type(await screen.findByLabelText('Summary'), 'No music');
    await userEvent.type(screen.getByLabelText('What happened?'), 'The song never starts.');
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));

    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledWith(12);
    });
    expect(form?.get('category')).toBe('SOUND');
    expect(form?.get('title')).toBe('No music');
    expect(form?.get('ratingId')).toBe('5');
    expect(form?.get('route')).toBe('/');
    expect(form?.get('screenshot')).toBeNull();
    const context = JSON.parse(form?.get('context') as string) as Record<string, unknown>;
    expect(Object.keys(context).sort()).toEqual(['language', 'viewport']);
    expect(screen.getByText('Included with your report')).toBeTruthy();
  });

  it('starts from what the page already knows', async () => {
    await open({ description: 'Loading takes ages' });

    expect(await screen.findByLabelText('What happened?')).toHaveValue('Loading takes ages');
    expect(screen.getByRole('radio', { name: 'Other' })).toHaveAttribute('aria-checked', 'true');
  });
});
