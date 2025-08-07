import { compileShader, convertSpritesheetToIndexArray, createGLContext, setGLProgram, setTexture } from "@shared/canvas/CanvasUtil";
import { SpriteSheet } from "src/types/SpriteSheetType";
import indexToColorFragment from "src/shared/canvas/shaders/index_to_color_frag.glsl";
import spriteSheetVertex from "src/shared/canvas/shaders/sprite_cut_vert.glsl";
import { Map } from "src/types/MapType";
import { MapManager } from "@utils/MapManager";
export interface GLPipeline {
  gl: WebGL2RenderingContext;
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
  map: Map,
  palette: Uint8Array,
  screenSize: { width: number; height: number }
): GLPipeline {
  const gl = createGLContext(canvas);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const spriteSheetBuffer = convertSpritesheetToIndexArray(spriteSheet);
  const mapManager: MapManager = new MapManager(map);
  const mapPixelBuffer: Uint8Array = mapManager.getMapPixelArray();

  const spriteSheetTexture = setTexture(gl,
    spriteSheet.size.width, spriteSheet.size.height,
    spriteSheetBuffer,
    gl.R8,
    gl.RED,
    gl.TEXTURE0);
  const paletteTexture = setTexture(gl,
    palette.length / 4, 1,
    palette,
    gl.RGBA,
    gl.RGBA,
    gl.TEXTURE1);

  const mapTexture = setTexture(gl,
    map.width * spriteSheet.spriteSize.width, map.height * spriteSheet.spriteSize.height,
    mapPixelBuffer,
    gl.R8,
    gl.RED,
    gl.TEXTURE2);

  const paletteSize = palette.length / 4;

  const vertexShaderSource = spriteSheetVertex;
  const fragmentShaderSource = indexToColorFragment;

  const vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
  const program = setGLProgram(gl, vertexShader, fragmentShader);
  gl.useProgram(program);

  gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0); // 0 is spriteSheetTexture (gl.TEXTURE0)
  gl.uniform1i(gl.getUniformLocation(program, "u_paletteTex"), 1); // 1 is paletteTexture (gl.TEXTURE1)
  gl.uniform1i(gl.getUniformLocation(program, "u_mapTexture"), 2); // 2 is mapTexture (gl.TEXTURE2)
  gl.uniform1f(gl.getUniformLocation(program, "u_paletteSize"), paletteSize);
  gl.uniform2f(gl.getUniformLocation(program, "screen_resolution"), screenSize.width, screenSize.height);

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
    paletteTexture,
  };
}
