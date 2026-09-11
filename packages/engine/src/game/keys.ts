/** Yjs key layout of a game document (schema v1) and the legacy v0 keys it replaces. */
export const GAME_SCHEMA_VERSION = 1;

export const KEYS = {
  meta: 'game.meta',
  codeFiles: 'code.files',
  codeMeta: 'code.meta',
  palette: 'gfx.palette',
  sheets: 'gfx.sheets',
  sprites: 'gfx.sprites',
  flags: 'gfx.flags',
  maps: 'map.maps',
  tiles: 'map.tiles',
  instruments: 'sound.instruments',
  patterns: 'sound.patterns',
  sfx: 'sound.sfx',
  songs: 'sound.songs',
  samples: 'sound.samples',
  netPermissions: 'net.permissions',
  // Project metadata texts mirrored to the backend; unchanged from v0.
  projectName: 'projectName',
  shortDescription: 'shortDescription',
  longDescription: 'longDescription',
  iconUrl: 'iconUrl',
  projectTags: 'projectTags',
} as const;

export const LEGACY_KEYS = {
  code: 'monaco',
  sprites: 'sprite',
  flags: 'sprite_flags',
  tiles: 'map',
  musics: 'sound_musics',
  selectedMusic: 'sound_selectedIndex',
  customInstruments: 'sound_customInstruments',
  netPermissions: 'multiplayerDirectory',
} as const;

export const SCREEN_WIDTH = 320;
export const SCREEN_HEIGHT = 180;
export const SPRITE_SIZE = 8;
export const SHEET_WIDTH = 128;
export const SHEET_HEIGHT = 128;
export const SPRITES_PER_ROW = SHEET_WIDTH / SPRITE_SIZE;
export const SPRITE_COUNT = SPRITES_PER_ROW * (SHEET_HEIGHT / SPRITE_SIZE);
export const MAP_WIDTH = 128;
export const MAP_HEIGHT = 32;
export const PALETTE_SIZE = 16;
export const MAIN_FILE = 'main';
/**
 * The entry file's key in `code.files` is fixed rather than a fresh UUID.
 *
 * Two clients that open the same still-empty document both run `seedDefaults`, and with a random id
 * each the Yjs merge keeps *both* — which is how the editor ended up showing the entry twice.
 * A constant key makes the two writes the same write, so the CRDT converges on one file.
 */
export const MAIN_FILE_ID = 'main';

/**
 * The first sheet's and the first map's keys, fixed for the reason {@link MAIN_FILE_ID} is.
 *
 * They also mean something the others do not: these two entries describe the pixels and tiles that
 * already live under `gfx.sprites`, `gfx.flags` and `map.tiles`, and keep living there. Moving that
 * content under the collection would rewrite every non-empty cell of every game in existence, cost
 * a tombstone apiece, and leave a client that predates the collection looking at an empty game.
 * Left where it is, such a client sees the first sheet and the first map exactly as it always did.
 */
export const FIRST_SHEET_ID = '0';
export const FIRST_MAP_ID = '0';
