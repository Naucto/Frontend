precision mediump float;
uniform sampler2D u_paletteTex;
uniform sampler2D u_texture;
uniform float u_paletteSize;
varying vec2 v_uv;

void main() {
    int index = int(texture2D(u_texture, v_uv).r * 255.0 + 0.5);
    vec2 uv = vec2(float(index) / u_paletteSize, 0.0);
    vec4 color = texture2D(u_paletteTex, uv);
    gl_FragColor = vec4(color.r, color.g, color.b, color.a);
}
