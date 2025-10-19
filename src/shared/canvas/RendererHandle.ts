import { rectangleToVertices } from "@shared/canvas/glUtils";
import { GLPipeline, initGLPipeline } from "@shared/canvas/GLSetup";
import { useEffect, useMemo, useRef } from "react";
import { CanvasError, CanvasNotInitializedError } from "src/errors/CanvasError";
import { MapProvider } from "@providers/editors/MapProvider.ts";
import { SpriteProvider } from "@providers/editors/SpriteProvider";

export type QueueSpriteDrawFn = (
  index: number,
  x: number,
  y: number,
  width?: number,
  height?: number,
  flip_h?: number,
  flip_v?: number,
  scale?: number
) => void;

export type SpriteRendererHandle = {
  queueSpriteDraw: QueueSpriteDrawFn;
  draw: () => void;
  drawMap: (x: number, y: number) => void;
  clear: (index: number) => void;
  setColor: (index: number, index2: number) => void;
  resetColor: () => void;
};

export function useSpriteRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  sprite: SpriteProvider,
  map: MapProvider,
  screenSize: { width: number, height: number }
): SpriteRendererHandle {
  const spriteNumber = sprite.size.width / sprite.spriteSize.width;
  const batchedVertices: number[] = [];
  const batchedUVs: number[] = [];
  const currentPalette: Uint8Array = new Uint8Array(sprite.palette);
  const currentPaletteSize = currentPalette.length / 4;

  const pipelineRef = useRef<GLPipeline | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) { throw new CanvasNotInitializedError(); }
    pipelineRef.current = initGLPipeline(canvas, sprite, map, screenSize);
    if (!pipelineRef.current) {
      throw new CanvasNotInitializedError();
    }
    return () => {
      pipelineRef.current?.destroy();
      pipelineRef.current = null;
    };
  }, [canvasRef, screenSize, map]);

  function draw(): void {
    const p = pipelineRef.current;
    if (!p) return;

    const gl = p.gl;
    const vertexBuffer = p.vertexBuffer;
    const uvBuffer = p.uvBuffer;
    const uvLocation = p.uvLoc;
    const posLoc = p.positionLoc;

    if (batchedVertices.length === 0) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(batchedVertices), gl.STREAM_DRAW);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(posLoc);

    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(batchedUVs), gl.STREAM_DRAW);
    gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(uvLocation);

    gl.drawArrays(gl.TRIANGLES, 0, batchedVertices.length / 2); // divided by 2 bcs batchedVertices is 2d

    batchedVertices.length = 0;
    batchedUVs.length = 0;
  }

  function drawMap(x: number, y: number): void {
    const p = pipelineRef.current;
    if (!p) return;

    if (batchedUVs.length > 0) {
      draw();
    }

    const gl = p.gl;
    const program = p.program;
    gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 2);
    const uv = new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      0, 1,
      1, 0,
      1, 1,
    ]);
    const vertices = rectangleToVertices(
      x,
      y,
      map.width * sprite.spriteSize.width,
      map.height * sprite.spriteSize.height
    );

    batchedVertices.push(...vertices);
    batchedUVs.push(...uv);
    draw();
    gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);
  }

  function queueSpriteDraw(index: number,
    x: number, y: number,
    width: number = 1, height: number = 1,
    flip_h: number = 0, flip_v: number = 0,
    scale: number = 1
  ): void {
    x = Math.floor(x);
    y = Math.floor(y);
    flip_h = flip_h ? 1 : 0;
    flip_v = flip_v ? 1 : 0;

    const x_sprite = index % (spriteNumber);
    const y_sprite = Math.floor(index / (spriteNumber));

    let u0 = x_sprite * sprite.spriteSize.width / sprite.size.width;
    let v0 = y_sprite * sprite.spriteSize.height / sprite.size.height;
    let u1 = (x_sprite + width) * sprite.spriteSize.width / sprite.size.width;
    let v1 = (y_sprite + height) * sprite.spriteSize.height / sprite.size.height;

    if (flip_h) [u0, u1] = [u1, u0];
    if (flip_v) [v0, v1] = [v1, v0];

    const uv = new Float32Array([
      u0, v0,
      u1, v0,
      u0, v1,
      u0, v1,
      u1, v0,
      u1, v1,
    ]);

    const vertices = rectangleToVertices(
      x,
      y,
      width * sprite.spriteSize.width * scale,
      height * sprite.spriteSize.height * scale,
    );

    batchedVertices.push(...vertices);
    batchedUVs.push(...uv);
  }

  function clear(n: number): void {
    const p = _getPipeline();
    const gl = p.gl;

    const distance = n * 4;

    if (distance >= currentPalette.length) {
      throw new CanvasError("Palette index out of bounds");
    }
    const r = sprite.palette[distance] / 255;
    const g = sprite.palette[distance + 1] / 255;
    const b = sprite.palette[distance + 2] / 255;
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function setColor(index: number, index2: number): void {
    const p = _getPipeline();
    const gl = p.gl;
    const distanceIndex = index * 4;
    const distanceIndex2 = index2 * 4;

    if (distanceIndex >= currentPalette.length || distanceIndex2 >= sprite.palette.length) {
      throw new CanvasError("Palette index out of bounds");
    }
    currentPalette[distanceIndex] = sprite.palette[distanceIndex2];
    currentPalette[distanceIndex + 1] = sprite.palette[distanceIndex2 + 1];
    currentPalette[distanceIndex + 2] = sprite.palette[distanceIndex2 + 2];
    currentPalette[distanceIndex + 3] = sprite.palette[distanceIndex2 + 3];

    gl.activeTexture(gl.TEXTURE1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0, 0,
      currentPaletteSize,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      currentPalette
    );
  }

  function resetColor(): void {
    const p = _getPipeline();
    const gl = p.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0, 0,
      currentPaletteSize,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      sprite.palette
    );
  }

  function _getPipeline(): GLPipeline {
    const p = pipelineRef.current;
    if (!p) { throw new CanvasNotInitializedError(); }
    return p;
  }

  return useMemo(() => ({
    queueSpriteDraw,
    draw,
    drawMap,
    clear,
    setColor,
    resetColor,
  }), []);
}
