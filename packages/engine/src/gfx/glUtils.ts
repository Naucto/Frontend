export class WebGlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebGlError';
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    return [0, 0, 0];
  }
  const value = parseInt(match[1] ?? '0', 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((component) => Math.max(0, Math.min(255, component)).toString(16).padStart(2, '0')).join('')}`;
}

export function createGLContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) {
    throw new WebGlError('WebGL2 is not supported');
  }
  return gl;
}

export function compileShader(
  gl: WebGL2RenderingContext,
  source: string,
  type: number,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new WebGlError('Failed to create shader');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new WebGlError(`Shader compilation failed: ${log ?? ''}`);
  }
  return shader;
}

export function linkProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const vertexShader = compileShader(gl, vs, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(gl, fs, gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new WebGlError(`Program linking failed: ${log ?? ''}`);
  }
  return program;
}

export function createTexture(gl: WebGL2RenderingContext, unit: number): WebGLTexture {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/**
 * Allocates the texture bound to `TEXTURE_2D` as one byte per texel — a palette index — and fills
 * it with `data`, or leaves it undefined when `data` is null.
 */
export function allocateR8(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  data: ArrayBufferView | null,
): void {
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, data);
}
