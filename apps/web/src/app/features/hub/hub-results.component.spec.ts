import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { client } from '@naucto/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gameOf, installLayoutStubs } from '../../shared/hub/testing';
import type { ResultsQuery } from '../../shared/queries/hub.queries';
import { testProviders } from '../../testing/providers';
import { HubResultsComponent } from './hub-results.component';

const text = (element: Element | null | undefined): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('HubResultsComponent', () => {
  let fixture: ComponentFixture<HubResultsComponent>;
  let asked: URL[];
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  /** Renders the results of a query, answered with those games. */
  const show = async (query: ResultsQuery, games: unknown[]): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn((request: Request) => {
        const url = new URL(request.url);
        asked.push(url);
        const body = url.pathname.endsWith('/tags')
          ? { tags: [{ tag: 'arcade', count: 4 }] }
          : url.pathname.startsWith('/hub/shelves/')
            ? { key: 'popular', kind: 'POPULAR', total: games.length, games, page: 1, limit: 24 }
            : { projects: games, total: games.length };
        return Promise.resolve(
          new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
        );
      }),
    );
    fixture = TestBed.createComponent(HubResultsComponent);
    fixture.componentRef.setInput('query', query);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host().querySelector('[data-testid="results-count"]')).not.toBeNull();
    });
  };

  beforeEach(async () => {
    installLayoutStubs();
    asked = [];
    client.setConfig({ baseUrl: 'https://api.test', throwOnError: false });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: testProviders() });
    const transloco = TestBed.inject(TranslocoService);
    await new Promise<void>((resolve) => {
      transloco.load('en').subscribe(() => {
        resolve();
      });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts each game under its first tag, in the order the tags show up', async () => {
    await show({ search: 'run' }, [
      gameOf(1, { tags: ['puzzle', 'arcade'] }),
      gameOf(2, { tags: [] }),
      gameOf(3, { tags: ['arcade'] }),
      gameOf(4, { tags: ['puzzle'] }),
    ]);

    expect(
      [...host().querySelectorAll('section')].map((panel) => text(panel.querySelector('div'))),
    ).toEqual(['Puzzle 2', 'Untagged 1', 'Arcade 1']);
    expect(text(host().querySelector('h2'))).toBe('“run”');
    expect(text(host().querySelector('[data-testid="results-count"]'))).toBe('4');
    expect(text(host().querySelector('nc-shelf-disk nc-disk-name'))).toBe('Game 1');
  });

  it('asks a search for its best match and a shelf for its own order until a sort is chosen', async () => {
    await show({ shelf: 'tag:arcade' }, [gameOf(1)]);

    expect(text(host().querySelector('h2'))).toBe('#arcade');
    expect(text(host().querySelector('[role="radio"][aria-checked="true"]'))).toBe('Hub order');
    expect(asked[0]?.pathname).toBe('/hub/shelves/tag%3Aarcade');
    expect(asked[0]?.searchParams.has('sort')).toBe(false);

    host().querySelectorAll<HTMLElement>('[role="radio"]')[1]?.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(asked.at(-1)?.searchParams.get('sort')).toBe('popular');
    });
  });

  it('offers the most used tags and to make the game when nothing is found', async () => {
    await show({ tags: 'nope' }, []);

    expect(text(host().querySelector('nc-empty-state h3'))).toBe('No disk in the drive');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        [...host().querySelectorAll('nc-empty-state a')].map((link) => link.getAttribute('href')),
      ).toEqual(['/hub?tags=arcade', '/games/new']);
    });
  });
});
