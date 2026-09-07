/**
 * Single source of truth for the Lua API surface: every namespaced function, its
 * signature, and the legacy global it replaces. Feeds the compat prelude, the
 * code migration, editor completions and the docs parity test.
 */
export interface LuaApiEntry {
  ns: 'gfx' | 'map' | 'input' | 'sound' | 'sys' | 'net';
  name: string;
  /** Human signature, e.g. "gfx.draw_sprite(n, x, y[, w, h, flip_h, flip_v, scale])" */
  signature: string;
  summary: string;
  /** Legacy global name, when one existed in v0. */
  legacy?: string;
  /** Argument permutation applied when migrating legacy calls: newArgs[i] = oldArgs[perm[i]]. */
  legacyArgOrder?: readonly number[];
}

export const LUA_API: readonly LuaApiEntry[] = [
  // gfx
  {
    ns: 'gfx',
    name: 'clear',
    signature: 'gfx.clear([colour])',
    summary: 'Fill the screen with a palette colour (default 0).',
    legacy: 'clear',
  },
  {
    ns: 'gfx',
    name: 'draw_sprite',
    signature: 'gfx.draw_sprite(n, x, y[, w, h, flip_h, flip_v, scale])',
    summary: 'Draw w×h tiles starting at sprite n. Index 0 is transparent.',
    legacy: 'sprite',
  },
  {
    ns: 'gfx',
    name: 'draw_region',
    signature: 'gfx.draw_region(sx, sy, sw, sh, dx, dy[, dw, dh, flip_h, flip_v])',
    summary: 'Draw a pixel rectangle of the sprite sheet, optionally scaled.',
  },
  {
    ns: 'gfx',
    name: 'pixel',
    signature: 'gfx.pixel(x, y, colour)',
    summary: 'Set one screen pixel.',
  },
  {
    ns: 'gfx',
    name: 'get_pixel',
    signature: 'gfx.get_pixel(x, y)',
    summary: 'Read the palette index at a screen pixel (slow).',
  },
  {
    ns: 'gfx',
    name: 'line',
    signature: 'gfx.line(x0, y0, x1, y1, colour)',
    summary: 'Draw a one-pixel line.',
    legacy: 'line',
    legacyArgOrder: [1, 2, 3, 4, 0],
  },
  {
    ns: 'gfx',
    name: 'rect',
    signature: 'gfx.rect(x, y, w, h, colour)',
    summary: 'Draw a rectangle outline.',
    legacy: 'rect',
    legacyArgOrder: [1, 2, 3, 4, 0],
  },
  {
    ns: 'gfx',
    name: 'fill_rect',
    signature: 'gfx.fill_rect(x, y, w, h, colour)',
    summary: 'Draw a filled rectangle.',
    legacy: 'fill_rect',
    legacyArgOrder: [1, 2, 3, 4, 0],
  },
  {
    ns: 'gfx',
    name: 'circle',
    signature: 'gfx.circle(cx, cy, r, colour)',
    summary: 'Draw a circle outline.',
  },
  {
    ns: 'gfx',
    name: 'fill_circle',
    signature: 'gfx.fill_circle(cx, cy, r, colour)',
    summary: 'Draw a filled circle.',
  },
  {
    ns: 'gfx',
    name: 'print',
    signature: 'gfx.print(text, x, y[, colour])',
    summary: 'Draw text with the built-in 4×6 font; returns its width.',
  },
  {
    ns: 'gfx',
    name: 'camera',
    signature: 'gfx.camera([x, y])',
    summary: 'Offset every later draw call; no arguments resets.',
    legacy: 'camera',
  },
  {
    ns: 'gfx',
    name: 'clip',
    signature: 'gfx.clip([x, y, w, h])',
    summary: 'Restrict drawing to a rectangle; no arguments resets.',
  },
  {
    ns: 'gfx',
    name: 'set_col',
    signature: 'gfx.set_col(from, to)',
    summary: 'Draw palette remap: pixels of colour `from` are drawn as `to`.',
    legacy: 'set_col',
  },
  {
    ns: 'gfx',
    name: 'reset_col',
    signature: 'gfx.reset_col()',
    summary: 'Clear the draw palette remap.',
    legacy: 'reset_col',
  },
  {
    ns: 'gfx',
    name: 'set_transparent',
    signature: 'gfx.set_transparent(colour[, on])',
    summary: 'Toggle transparency of a palette index when drawing sprites (default: only 0).',
  },
  {
    ns: 'gfx',
    name: 'set_color',
    signature: 'gfx.set_color(index, hex | r, g, b)',
    summary: 'Change a screen colour at runtime.',
  },
  {
    ns: 'gfx',
    name: 'get_color',
    signature: 'gfx.get_color(index)',
    summary: 'Current screen colour as "#rrggbb".',
  },
  {
    ns: 'gfx',
    name: 'reset_palette',
    signature: 'gfx.reset_palette()',
    summary: 'Restore the game palette and clear extra rows.',
  },
  {
    ns: 'gfx',
    name: 'set_palette_row',
    signature: 'gfx.set_palette_row(row, colours)',
    summary: 'Define screen palette row 1..15 (16 hex strings).',
  },
  {
    ns: 'gfx',
    name: 'screen_col',
    signature: 'gfx.screen_col(from, to[, row])',
    summary: 'Screen palette remap applied at display time.',
  },
  {
    ns: 'gfx',
    name: 'scanline',
    signature: 'gfx.scanline(y, {shift_x=, shift_y=, palette=, wrap=, blank=})',
    summary: 'Per-row display effect.',
  },
  {
    ns: 'gfx',
    name: 'scanline_range',
    signature: 'gfx.scanline_range(y0, y1, opts)',
    summary: 'Apply the same effect to rows y0..y1.',
  },
  {
    ns: 'gfx',
    name: 'scanline_fn',
    signature: 'gfx.scanline_fn(fn)',
    summary: 'Call fn(y) for every row once and apply the returned effect.',
  },
  {
    ns: 'gfx',
    name: 'reset_scanlines',
    signature: 'gfx.reset_scanlines()',
    summary: 'Clear all row effects.',
  },
  {
    ns: 'gfx',
    name: 'persist_effects',
    signature: 'gfx.persist_effects(on)',
    summary: 'Keep row effects across gfx.clear().',
  },
  { ns: 'gfx', name: 'width', signature: 'gfx.width()', summary: 'Screen width (320).' },
  { ns: 'gfx', name: 'height', signature: 'gfx.height()', summary: 'Screen height (180).' },
  // map
  {
    ns: 'map',
    name: 'draw',
    signature: 'map.draw(x, y[, tx, ty, tw, th])',
    summary: 'Draw the tile map (or a sub-rectangle of tiles) at a pixel position.',
    legacy: 'map',
  },
  {
    ns: 'map',
    name: 'get',
    signature: 'map.get(tx, ty)',
    summary: 'Sprite index at a tile.',
    legacy: 'mget',
  },
  {
    ns: 'map',
    name: 'set',
    signature: 'map.set(tx, ty, n)',
    summary: 'Change a tile for this run only.',
  },
  {
    ns: 'map',
    name: 'flag',
    signature: 'map.flag(n[, bit])',
    summary: 'Flags byte of sprite n, or one bit of it.',
    legacy: 'fget',
  },
  { ns: 'map', name: 'width', signature: 'map.width()', summary: 'Map width in tiles (128).' },
  { ns: 'map', name: 'height', signature: 'map.height()', summary: 'Map height in tiles (32).' },
  // input
  {
    ns: 'input',
    name: 'btn',
    signature: 'input.btn(action[, player])',
    summary: 'True while an action (left right up down a b x y pause) is held.',
  },
  {
    ns: 'input',
    name: 'btnp',
    signature: 'input.btnp(action[, player])',
    summary: 'True on the step an action was pressed.',
  },
  {
    ns: 'input',
    name: 'btnr',
    signature: 'input.btnr(action[, player])',
    summary: 'True on the step an action was released.',
  },
  {
    ns: 'input',
    name: 'key_pressed',
    signature: 'input.key_pressed(key)',
    summary: 'True while a keyboard key (event.key name) is held.',
    legacy: 'key_pressed',
  },
  {
    ns: 'input',
    name: 'key_down',
    signature: 'input.key_down(key)',
    summary: 'True on the step a key went down.',
  },
  {
    ns: 'input',
    name: 'get_mouse_pos',
    signature: 'input.get_mouse_pos()',
    summary: 'Mouse x, y in screen pixels (nil when outside).',
  },
  {
    ns: 'input',
    name: 'mouse_pressed',
    signature: 'input.mouse_pressed([button])',
    summary: 'True while a mouse button is held.',
  },
  {
    ns: 'input',
    name: 'mouse_down',
    signature: 'input.mouse_down([button])',
    summary: 'True on the step a mouse button was pressed.',
  },
  {
    ns: 'input',
    name: 'declare',
    signature: 'input.declare({ action = "label", ... })',
    summary: 'Name the actions this game uses, e.g. { a = "jump", x = "action" }.',
  },
  {
    ns: 'input',
    name: 'players',
    signature: 'input.players()',
    summary: 'Number of connected players (keyboard counts as one).',
  },
  // sound
  {
    ns: 'sound',
    name: 'play_sfx',
    signature: 'sound.play_sfx(slot[, channel, pitch_offset, volume])',
    summary: 'Play SFX slot 0..15.',
  },
  {
    ns: 'sound',
    name: 'play_note',
    signature: 'sound.play_note(instrument, pitch[, length, volume, channel])',
    summary: 'Play a note now; pitch is MIDI or "C4".',
  },
  {
    ns: 'sound',
    name: 'stop_note',
    signature: 'sound.stop_note(channel)',
    summary: 'Release a voice.',
  },
  {
    ns: 'sound',
    name: 'play_music',
    signature: 'sound.play_music(song[, loop, fade_in])',
    summary: 'Start song slot 0..15 from the tracker.',
    legacy: 'play_music',
  },
  {
    ns: 'sound',
    name: 'stop_music',
    signature: 'sound.stop_music([fade_out])',
    summary: 'Stop the music.',
    legacy: 'stop_music',
  },
  { ns: 'sound', name: 'stop', signature: 'sound.stop()', summary: 'Stop everything.' },
  {
    ns: 'sound',
    name: 'set_volume',
    signature: 'sound.set_volume(master[, music, sfx])',
    summary: 'Mixer levels 0..1.',
  },
  {
    ns: 'sound',
    name: 'music_position',
    signature: 'sound.music_position()',
    summary: 'pattern_index, step of the playing song (nil when stopped).',
  },
  {
    ns: 'sound',
    name: 'is_playing',
    signature: 'sound.is_playing(channel)',
    summary: 'Whether a voice is sounding.',
  },
  // sys
  { ns: 'sys', name: 'dt', signature: 'sys.dt()', summary: 'Fixed step length in seconds (1/60).' },
  { ns: 'sys', name: 'frame', signature: 'sys.frame()', summary: 'Frames since _init.' },
  { ns: 'sys', name: 'time', signature: 'sys.time()', summary: 'Seconds since _init.' },
  { ns: 'sys', name: 'fps', signature: 'sys.fps()', summary: 'Measured frames per second.' },
  {
    ns: 'sys',
    name: 'log',
    signature: 'sys.log(...)',
    summary: 'Write to the console (same as print).',
  },
  {
    ns: 'sys',
    name: 'warn',
    signature: 'sys.warn(...)',
    summary: 'Write a warning to the console.',
  },
  {
    ns: 'sys',
    name: 'error',
    signature: 'sys.error(...)',
    summary: 'Write an error line to the console.',
  },
  // net (unchanged)
  {
    ns: 'net',
    name: 'host',
    signature: 'net.host([config], callback)',
    summary: 'Open the host dialog; callback(session) when ready.',
  },
  { ns: 'net', name: 'join', signature: 'net.join(callback)', summary: 'Open the join dialog.' },
  { ns: 'net', name: 'leave', signature: 'net.leave()', summary: 'Leave the current session.' },
  { ns: 'net', name: 'id', signature: 'net.id()', summary: 'Your player id in the session.' },
  {
    ns: 'net',
    name: 'on',
    signature: 'net.on(pattern, callback)',
    summary: 'React to net.state changes or events.',
  },
  { ns: 'net', name: 'emit', signature: 'net.emit(name, payload)', summary: 'Broadcast an event.' },
  { ns: 'net', name: 'lock', signature: 'net.lock()', summary: 'Create a replicated lock value.' },
  {
    ns: 'net',
    name: 'queue',
    signature: 'net.queue()',
    summary: 'Create a replicated queue value.',
  },
];

export const LEGACY_ALIASES: ReadonlyMap<string, LuaApiEntry> = new Map(
  LUA_API.filter((e) => e.legacy !== undefined).map((e) => [e.legacy ?? '', e]),
);
