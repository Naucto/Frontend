/** Yjs key layout of a game document, and the legacy v0 keys it replaces. */
export const GAME_SCHEMA_VERSION = 2;

export const KEYS = {
  meta: 'game.meta',
  codeFiles: 'code.files',
  codeMeta: 'code.meta',
  palette: 'gfx.palette',
  sheets: 'gfx.sheets',
  maps: 'map.maps',
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

/**
 * Field names inside one entry of a collection root: a code file, a sheet or a map. A sheet's
 * `pixels` and `flags` and a map's `tiles` hold its cells as nested maps keyed `"x,y"`.
 */
export const ENTRY_KEYS = {
  name: 'name',
  order: 'order',
  colour: 'colour',
  text: 'text',
  width: 'w',
  height: 'h',
  pixels: 'pixels',
  flags: 'flags',
  tiles: 'tiles',
} as const;

/** Field names in the `game.meta` root, and `entry` in `code.meta`. */
export const META_KEYS = {
  schemaVersion: 'schemaVersion',
  actions: 'actions',
  entry: 'entry',
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
 * The entry file's key in `code.files`, fixed so two clients seeding the same empty document write
 * the same file.
 */
export const MAIN_FILE_ID = 'main';

/** The first sheet's and map's keys, fixed like {@link MAIN_FILE_ID}. */
export const FIRST_SHEET_ID = '0';
export const FIRST_MAP_ID = '0';
