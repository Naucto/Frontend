import { compileShader, convertSpritesheetToRGBArray, createGLContext, setGLProgram, setTexture } from "@shared/canvas/CanvasUtil";
import { SpriteSheet } from "src/types/SpriteSheetType";

export interface GLPipeline {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  vertexBuffer: WebGLBuffer;
  uvBuffer: WebGLBuffer;
  paletteTexture: WebGLTexture
  positionLoc: number;
  uvLoc: number;
  destroy: () => void;
}

export function initGLPipeline(
  canvas: HTMLCanvasElement,
  spriteSheet: SpriteSheet,
  palette: Uint8Array,
  screenSize: { width: number; height: number }
): GLPipeline {
  const gl = createGLContext(canvas);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const rgbBuffer = convertSpritesheetToRGBArray(spriteSheet);
  const spriteSheetTexture = setTexture(gl,
    spriteSheet.size.width, spriteSheet.size.height,
    rgbBuffer,
    gl.R8,
    gl.RED,
    gl.TEXTURE0);
  const paletteTexture = setTexture(gl,
    palette.length >> 2, 1,
    palette,
    gl.RGBA,
    gl.RGBA,
    gl.TEXTURE1);

  const paletteSize = palette.length >> 2;

  const vertexShaderSource = `
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
  `;

  const fragmentShaderSource = `
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
  }`;

  const vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
  const program = setGLProgram(gl, vertexShader, fragmentShader);
  gl.useProgram(program);

  gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0); // 0 is spriteSheetTexture (gl.TEXTURE0)
  gl.uniform1i(gl.getUniformLocation(program, "u_paletteTex"), 1); // 1 is paletteTexture (gl.TEXTURE1)
  gl.uniform1f(gl.getUniformLocation(program, "u_paletteSize"), paletteSize);
  gl.uniform2f(gl.getUniformLocation(program, "screen_resolution"), screenSize.width, screenSize.height);

  const positionLoc = gl.getAttribLocation(program, "vertex_position");
  const uvLoc = gl.getAttribLocation(program, "vertex_uv");

  const vertexBuffer = gl.createBuffer()!;
  const uvBuffer = gl.createBuffer()!;

  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const destroy = () => {
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.deleteBuffer(vertexBuffer);
    gl.deleteBuffer(uvBuffer);
    gl.deleteTexture(paletteTexture);
    gl.deleteTexture(spriteSheetTexture);
  };

  return {
    gl,
    program,
    vertexBuffer,
    uvBuffer,
    destroy,
    positionLoc,
    uvLoc,
    paletteTexture,
  };
}