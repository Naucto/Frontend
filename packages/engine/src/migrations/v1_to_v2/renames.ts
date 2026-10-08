/**
 * The v1 names schema v2 renamed, each with what it is called now. Frozen: it describes v1 as it
 * was, so it must not follow the API as the API moves on.
 */
export const V1_RENAMES: ReadonlyMap<string, string> = new Map([
  ['input.btn', 'input.held'],
  ['input.btnp', 'input.pressed'],
  ['input.btnr', 'input.released'],
  ['sound.music_position', 'sound.music_pos'],
]);
