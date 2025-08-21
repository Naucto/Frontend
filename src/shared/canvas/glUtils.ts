import { SpriteSheet } from "src/types/SpriteSheetType";
import { ColorFormatError } from "src/errors/ColorFormatError";
import { SpriteSheetError } from "src/errors/SpriteSheetError";
import WebGlError from "src/errors/WebGlError";

export function convertSpritesheetToIndexArray(spriteSheet: SpriteSheet): Uint8Array {
  const spriteSize = spriteSheet.size.width * spriteSheet.size.height;
  const array = new Uint8Array(spriteSize);
  if (spriteSheet.stride <= 0) {
    throw new SpriteSheetError("Stride must be greater than 0");
  }
  for (let i = 0; i < spriteSheet.spriteSheet.length; i += spriteSheet.stride) {
    const pixelHexa = spriteSheet.spriteSheet.slice(i, i + spriteSheet.stride);
    const pixel = parseInt(pixelHexa, 16);
    array[i / spriteSheet.stride] = (pixel);
  }
  return array;
}

export function hexToRGBArray(hex: string, alpha = 255): number[] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new ColorFormatError(`Invalid hex color: ${hex}`);
  }

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5), 16);
  const a = alpha;

  return [r, g, b, a];
}

export function getRGBArraysFromPalette(palette: string[], zeroAlphaIndex = 0): number[] {
  return palette.flatMap((color, index) => {
    const rgba = hexToRGBArray(color);
    if (index === zeroAlphaIndex) {
      rgba[3] = 0;
    }
    return rgba;
  });
}

export function createGLContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    throw new WebGlError("WebGL not supported");
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
  return gl;
}

export function setTexture(gl: WebGLRenderingContext,
  width: number,
  height: number,
  data: Uint8Array,
  internalFormat: Maybe<GLenum> = undefined,
  format: GLenum = gl.RGBA,
  activeTexture: GLenum = gl.TEXTURE0,
  octetPerData: number = 4
): WebGLTexture {
  if (internalFormat === undefined) {
    internalFormat = format;
  }
  const texture = gl.createTexture();
  gl.activeTexture(activeTexture);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, octetPerData);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    width, height,
    0,
    format,
    gl.UNSIGNED_BYTE,
    data
  );
  return texture;
}

export function rectangleToVertices(x: number, y: number, width: number, height: number): Float32Array {
  return new Float32Array([
    x, y,
    x + width, y,
    x, y + height,
    x, y + height,
    x + width, y,
    x + width, y + height
  ]);
}

export function compileShader(gl: WebGLRenderingContext, source: string, type: GLenum): WebGLShader {
  const vertexShader = gl.createShader(type);
  if (!vertexShader) {
    throw new WebGlError("Failed to create vertex shader");
  }
  gl.shaderSource(vertexShader, source);
  gl.compileShader(vertexShader);

  const success = gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS);
  if (!success) {
    const log = gl.getShaderInfoLog(vertexShader);
    gl.deleteShader(vertexShader);
    throw new WebGlError(`Vertex shader compilation failed: ${log}`);
  }

  return vertexShader;
}

export function setGLProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
  const program = gl.createProgram();
  if (!program) {
    throw new WebGlError("Failed to create program");
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.useProgram(program);

  const success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!success) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new WebGlError(`Program linking failed: ${log}`);
  }

  return program;
}
