/** Yjs key layout of a game document (schema v1) and the legacy v0 keys it replaces. */
export const GAME_SCHEMA_VERSION = 1;

export const KEYS = {
  meta: 'game.meta',
  codeFiles: 'code.files',
  codeMeta: 'code.meta',
  palette: 'gfx.palette',
  sprites: 'gfx.sprites',
  flags: 'gfx.flags',
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
export const MAIN_FILE = 'main.lua';
/**
 * The entry file's key in `code.files` is fixed rather than a fresh UUID.
 *
 * Two clients that open the same still-empty document both run `seedDefaults`, and with a random id
 * each the Yjs merge keeps *both* — which is how the editor ended up showing two `main.lua` tabs.
 * A constant key makes the two writes the same write, so the CRDT converges on one file.
 */
export const MAIN_FILE_ID = 'main';
