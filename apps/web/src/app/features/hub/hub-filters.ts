export type HubFilter = 'all' | 'arcade' | 'puzzle' | 'multiplayer' | 'remixable';

export const FILTER_TAGS: Record<HubFilter, string | null> = {
  all: null,
  arcade: 'arcade',
  puzzle: 'puzzle',
  multiplayer: 'multiplayer',
  remixable: 'remixable',
};
