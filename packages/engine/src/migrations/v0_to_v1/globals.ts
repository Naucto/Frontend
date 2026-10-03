/** What a v0 global became in schema v1. */
export interface V0Global {
  /** The namespaced call, as `ns.name`. */
  target: string;
  /** Where each v1 argument comes from: `v1Args[i] = v0Args[argOrder[i]]`. */
  argOrder?: readonly number[];
}

/**
 * The globals the first schema's Lua API had, each with the call schema v1 gave it. Frozen: it
 * describes v0 as it was, so it must not follow the API as the API moves on.
 */
export const V0_GLOBALS: ReadonlyMap<string, V0Global> = new Map<string, V0Global>([
  ['clear', { target: 'gfx.clear' }],
  ['sprite', { target: 'gfx.draw_sprite' }],
  ['line', { target: 'gfx.line', argOrder: [1, 2, 3, 4, 0] }],
  ['rect', { target: 'gfx.rect', argOrder: [1, 2, 3, 4, 0] }],
  ['fill_rect', { target: 'gfx.fill_rect', argOrder: [1, 2, 3, 4, 0] }],
  ['camera', { target: 'gfx.camera' }],
  ['set_col', { target: 'gfx.set_col' }],
  ['reset_col', { target: 'gfx.reset_col' }],
  ['map', { target: 'map.draw' }],
  ['mget', { target: 'map.get' }],
  ['fget', { target: 'map.flag' }],
  ['key_pressed', { target: 'input.key_pressed' }],
  ['play_music', { target: 'sound.play_music' }],
  ['stop_music', { target: 'sound.stop_music' }],
]);
