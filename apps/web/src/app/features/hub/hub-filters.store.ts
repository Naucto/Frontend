import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

export type HubFilter = 'all' | 'arcade' | 'puzzle' | 'multiplayer' | 'remixable';

/** Survives navigation so the hub comes back as you left it. */
export const HubFiltersStore = signalStore(
  { providedIn: 'root' },
  withState<{ popular: HubFilter; search: string }>({ popular: 'all', search: '' }),
  withMethods((store) => ({
    setPopular(f: HubFilter): void {
      patchState(store, { popular: f });
    },
    setSearch(q: string): void {
      patchState(store, { search: q });
    },
  })),
);

export const FILTER_TAGS: Record<HubFilter, string | null> = {
  all: null,
  arcade: 'arcade',
  puzzle: 'puzzle',
  multiplayer: 'multiplayer',
  remixable: 'remixable',
};
