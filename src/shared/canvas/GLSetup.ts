import { compileShader, createGLContext, setGLProgram, setTexture } from "@shared/canvas/glUtils";
import indexToColorFragment from "src/shared/canvas/shaders/index_to_color_frag.glsl";
import spriteSheetVertex from "src/shared/canvas/shaders/sprite_cut_vert.glsl";
import { MapProvider } from "@providers/editors/MapProvider.ts";
import { SpriteProvider } from "@providers/editors/SpriteProvider";
export interface GLPipeline {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vertexBuffer: WebGLBuffer;
  uvBuffer: WebGLBuffer;
  paletteTexture: WebGLTexture
  positionLoc: number;
  uvLoc: number;
  cameraPosLoc: WebGLUniformLocation | null;
  destroy: () => void;
}

export function initGLPipeline(
  canvas: HTMLCanvasElement,
  sprite: SpriteProvider,
  map: MapProvider,
  screenSize: { width: number; height: number }
): GLPipeline {
  const gl = createGLContext(canvas);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const spriteSheetBuffer = sprite.getU8PixelBuffer();
  const mapPixelBuffer: Uint8Array = map.getU8PixelBuffer();

  const spriteSheetTexture = setTexture(gl,
    sprite.size.width, sprite.size.height,
    spriteSheetBuffer,
    gl.R8,
    gl.RED,
    gl.TEXTURE0);
  const paletteTexture = setTexture(gl,
    sprite.palette.length / 4, 1,
    sprite.palette,
    gl.RGBA,
    gl.RGBA,
    gl.TEXTURE1);

  const mapTexture = setTexture(gl,
    map.width * sprite.spriteSize.width, map.height * sprite.spriteSize.height,
    mapPixelBuffer,
    gl.R8,
    gl.RED,
    gl.TEXTURE2);

  const paletteSize = sprite.palette.length / 4;

  const vertexShaderSource = spriteSheetVertex;
  const fragmentShaderSource = indexToColorFragment;

  const vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
  const program = setGLProgram(gl, vertexShader, fragmentShader);
  gl.useProgram(program);

  gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0); // 0 is spriteSheetTexture (gl.TEXTURE0)
  gl.uniform1i(gl.getUniformLocation(program, "u_paletteTex"), 1); // 1 is paletteTexture (gl.TEXTURE1)
  gl.uniform1f(gl.getUniformLocation(program, "u_paletteSize"), paletteSize);
  gl.uniform2f(gl.getUniformLocation(program, "screen_resolution"), screenSize.width, screenSize.height);

  const cameraPosLoc = gl.getUniformLocation(program, "camera_position");
  gl.uniform2f(cameraPosLoc, 0.0, 0.0);

  const positionLoc = gl.getAttribLocation(program, "vertex_position");
  const uvLoc = gl.getAttribLocation(program, "vertex_uv");

  const vertexBuffer = gl.createBuffer()!;
  const uvBuffer = gl.createBuffer()!;

  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const destroy = (): void => {
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.deleteBuffer(vertexBuffer);
    gl.deleteBuffer(uvBuffer);
    gl.deleteTexture(paletteTexture);
    gl.deleteTexture(spriteSheetTexture);
    gl.deleteTexture(mapTexture);
  };

  return {
    gl,
    program,
    vertexBuffer,
    uvBuffer,
    destroy,
    positionLoc,
    uvLoc,
    cameraPosLoc,
    paletteTexture,
  };
}
