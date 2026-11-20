import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import type { ProjectExResponseDto } from '@naucto/api-client';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { qk } from '../queries/query-keys';
import { GameDiskComponent } from './game-disk.component';

const COVER = 'data:image/png;base64,AA==';

function game(over: Partial<ProjectExResponseDto>): ProjectExResponseDto {
  return {
    id: 7,
    name: 'Hightide',
    publishedAt: '2026-10-01T00:00:00Z',
    likes: 318,
    viewCount: 1247,
    creator: { id: 1, username: 'louis' },
    collaborators: [],
    ...over,
  } as ProjectExResponseDto;
}

function render(inputs: Record<string, unknown>): ComponentFixture<GameDiskComponent> {
  const fixture = TestBed.createComponent(GameDiskComponent);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return fixture;
}

describe('GameDiskComponent', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {
          return undefined;
        }
        disconnect(): void {
          return undefined;
        }
      },
    );
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
    // Both covers are already known, so no test reaches for the network.
    const queries = new QueryClient();
    queries.setQueryData(qk.releaseImage(7), COVER);
    queries.setQueryData(qk.projectImage(7), COVER);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { en: { games: { draft: 'Draft' } } },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideRouter([]), provideTanStackQuery(queries)],
    });
  });

  it('plays a published game and prints it on its disk', () => {
    const host = render({ game: game({}) }).nativeElement as HTMLElement;
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/play/7');
    expect(host.querySelector('nc-floppy .name')?.textContent).toContain('Hightide');
    expect(host.querySelector('nc-floppy .info')?.textContent).toContain('louis');
    expect(host.querySelector('nc-floppy .action')?.classList).toContain('play');
    expect(host.querySelector('nc-floppy .cover img')?.getAttribute('src')).toBe(COVER);
    expect(host.querySelector('nc-chip')).toBeNull();
  });

  it('opens a draft in the editor and says it is one', () => {
    const host = render({ game: game({ publishedAt: null }) }).nativeElement as HTMLElement;
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/edit/7');
    expect(host.querySelector('nc-floppy .action')?.classList).toContain('edit');
    expect(host.querySelector('nc-floppy nc-chip')?.textContent).toContain('Draft');
  });

  it('opens a published game in the editor from its owner’s shelf', () => {
    const host = render({ game: game({}), opensEditor: true }).nativeElement as HTMLElement;
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/edit/7');
    expect(host.querySelector('nc-chip')).toBeNull();
  });

  it('is a small still disk beside the name when dense', () => {
    const host = render({ game: game({ publishedAt: null }), dense: true })
      .nativeElement as HTMLElement;
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/edit/7');
    expect(host.querySelector('nc-floppy')?.classList).not.toContain('interactive');
    expect(host.querySelector('nc-floppy .name')).toBeNull();
    expect(host.querySelector('a')?.textContent).toContain('Hightide');
    expect(host.querySelector('nc-chip')?.textContent).toContain('Draft');
  });

  it('wears the style its author chose', () => {
    const host = render({ game: { ...game({}), disk: { color: '#ff80a4', finish: 'solid' } } })
      .nativeElement as HTMLElement;
    expect(host.querySelector<HTMLElement>('nc-floppy')?.style.getPropertyValue('--f-body')).toBe(
      '#ff80a4',
    );
  });
});
