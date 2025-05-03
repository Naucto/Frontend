uniform vec2 screen_resolution;
attribute vec2 vertex_position;
attribute vec2 vertex_uv;
varying vec2 v_uv;

void main() {
    vec2 normalized = vertex_position / vec2(screen_resolution.x, screen_resolution.y);
    vec2 clipSpace = normalized * 2.0 - 1.0;
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
    v_uv = vertex_uv;
}