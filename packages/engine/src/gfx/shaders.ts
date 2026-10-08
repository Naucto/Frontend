import { PALETTE_SIZE, SCREEN_HEIGHT } from '../game/keys';

/** Pass 1: batched quads sampling an R8 index texture, written into the R8 frame target. */
export const DRAW_VS = `#version 300 es
precision highp float;
uniform vec2 u_screen;
uniform vec2 u_camera;
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  vec2 n = (a_pos - u_camera) / u_screen;
  vec2 clip = n * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
}`;

export const DRAW_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_src;
uniform int u_remap[16];
uniform int u_transparent; // bitmask of transparent indices
uniform int u_solid;       // -1 = sample texture, else draw this index
in vec2 v_uv;
out vec4 o_index;
void main() {
  int idx;
  if (u_solid >= 0) {
    idx = u_solid;
  } else {
    idx = int(texture(u_src, v_uv).r * 255.0 + 0.5);
    if (((u_transparent >> idx) & 1) == 1) discard;
  }
  idx = u_remap[idx & 15];
  o_index = vec4(float(idx) / 255.0, 0.0, 0.0, 1.0);
}`;

/** A line's effect flags, as the effects texture's fourth channel carries them. */
export const FX_WRAP = 1;
export const FX_BLANK = 2;

/** Pass 2: present the index frame through the effect table and screen palette. */
export const PRESENT_VS = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID & 1) << 2), float((gl_VertexID & 2) << 1));
  v_uv = p * 0.5;
  gl_Position = vec4(p - 1.0, 0.0, 1.0);
}`;

export const PRESENT_FS = `#version 300 es
precision highp float;
precision highp int;
#define FX_WRAP ${String(FX_WRAP)}
#define FX_BLANK ${String(FX_BLANK)}
uniform sampler2D u_frame;
uniform highp isampler2D u_effects; // ${String(SCREEN_HEIGHT)} x 1, RGBA16I: shiftX, shiftY, palRow, flags
uniform sampler2D u_palettes;       // ${String(PALETTE_SIZE)} x ${String(SCREEN_HEIGHT + 1)} RGBA: row 0 the frame, row y + 1 line y's own
in vec2 v_uv;
out vec4 o_color;
void main() {
  ivec2 size = textureSize(u_frame, 0);
  ivec2 p = ivec2(v_uv * vec2(size));
  // p.y counts from the bottom of the frame target and game rows from the top, as in DRAW_VS,
  // applyClip and getPixel.
  int scan = size.y - 1 - p.y;
  ivec4 fx = texelFetch(u_effects, ivec2(scan, 0), 0);
  if ((fx.w & FX_BLANK) != 0) { o_color = vec4(0.0, 0.0, 0.0, 1.0); return; }
  // A shift is expressed in game coordinates: positive y moves the line down the screen.
  ivec2 src = ivec2(p.x, scan) - fx.xy;
  if ((fx.w & FX_WRAP) != 0) src.x = ((src.x % size.x) + size.x) % size.x;
  int row = clamp(fx.z, 0, ${String(SCREEN_HEIGHT)});
  if (src.x < 0 || src.x >= size.x || src.y < 0 || src.y >= size.y) {
    o_color = texelFetch(u_palettes, ivec2(0, row), 0);
    return;
  }
  int idx = int(texelFetch(u_frame, ivec2(src.x, size.y - 1 - src.y), 0).r * 255.0 + 0.5);
  o_color = texelFetch(u_palettes, ivec2(idx & 15, row), 0);
}`;
