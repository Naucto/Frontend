import { convertSpritesheetToRGBArray, createGLContext, rectangleToVertices, setGLProgram, setProgram, setShader, setTexture } from "@shared/canvas/CanvasUtil";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { SpriteSheet } from "src/types/SpriteSheetType";
import styled from "styled-components";


type CanvasHandle = {
  drawSprite: (n: number, x: number, y: number, width?: number, height?: number, flip_h?: number, flip_v?: number) => void;
  draw: () => void;
  clear: (n: number) => void;
};

export type { CanvasHandle };

type CanvasProps = {
  spriteSheet: SpriteSheet;
  screenSize: {
    width: number;
    height: number;
  };
  palette: Uint8Array;
  className?: string;
};

const Canvas = forwardRef<CanvasHandle, CanvasProps>(({ screenSize, spriteSheet, palette, className }, ref) => {

  const drawSpriteHandle = useCallback((n: number, x: number, y: number, w: number = 1, h: number = 1, fh: number = 0, fv: number = 0) => {
    drawSprite(n, x, y, w, h, fh, fv);
  }, []);

  const clearHandle = useCallback((n: number) => {
    clear(n);
  }, []);

  const drawHandle = useCallback(() => {
    draw();
  }, []);


  useImperativeHandle(ref, () => ({
    drawSprite: drawSpriteHandle,
    clear: clearHandle,
    draw: drawHandle,
  }));

  const spriteNumber = spriteSheet.size.width / spriteSheet.spriteSize.width;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const paletteTextureRef = useRef<WebGLTexture | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const paletteSize: number = palette.length / 4;

  const uvLocRef = useRef<number>(-1);
  const posLocRef = useRef<number>(-1);

  const uvBufferRef = useRef<WebGLBuffer | null>(null);
  const vertexBufferRef = useRef<WebGLBuffer | null>(null);

  const batchedVertices: number[] = [];
  const batchedUVs: number[] = [];


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = createGLContext(canvas);
    glRef.current = gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const rgbBuffer = convertSpritesheetToRGBArray(spriteSheet);
    const spriteSheetTexture = setTexture(gl, spriteSheet.size.width, spriteSheet.size.height, new Uint8Array(rgbBuffer), gl.LUMINANCE);
    paletteTextureRef.current = setTexture(gl, palette.length / 4, 1, new Uint8Array(palette), gl.RGBA, gl.TEXTURE1);
    if (!paletteTextureRef.current) {
      console.error("Failed to create palette texture");
      return;
    }

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

    const vertexShader = setShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = setShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
    const program = setGLProgram(gl, vertexShader, fragmentShader);
    if (!program) return;
    programRef.current = program;

    const uvLoc = gl.getAttribLocation(program, "vertex_uv");
    uvLocRef.current = uvLoc;

    const paletteTexLoc = gl.getUniformLocation(program, "u_paletteTex");
    gl.uniform1i(paletteTexLoc, 1);

    const texLoc = gl.getUniformLocation(program, "u_texture");
    gl.uniform1i(texLoc, 0);

    const paletteSizeLoc = gl.getUniformLocation(program, "u_paletteSize");
    gl.uniform1f(paletteSizeLoc, paletteSize);

    const screenResolutionLoc = gl.getUniformLocation(program, "screen_resolution");
    gl.uniform2f(screenResolutionLoc, screenSize.width, screenSize.height);

    const posLoc = gl.getAttribLocation(program, "vertex_position");
    posLocRef.current = posLoc;

    uvBufferRef.current = gl.createBuffer();
    vertexBufferRef.current = gl.createBuffer();

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return () => {
      if (!gl) return;
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(vertexBufferRef.current);
      gl.deleteTexture(paletteTextureRef.current);
      gl.deleteTexture(spriteSheetTexture);
      paletteTextureRef.current = null;
    }
  }, []);

  function draw() {
    const gl = glRef.current;
    const program = programRef.current;
    const uvLoc = uvLocRef.current;
    const posLoc = posLocRef.current;
    const vertexBuffer = vertexBufferRef.current;
    const uvBuffer = uvBufferRef.current;

    if (!gl || !program) return;
    if (batchedVertices.length === 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(batchedVertices), gl.STREAM_DRAW);

    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(posLoc);

    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(batchedUVs), gl.STREAM_DRAW);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(uvLoc);

    gl.drawArrays(gl.TRIANGLES, 0, batchedVertices.length / 2);

    batchedVertices.length = 0;
    batchedUVs.length = 0;
  }

  function drawSprite(n: number, x: number, y: number, width: number = 1, height: number = 1, flip_h: number = 0, flip_v: number = 0) {
    const gl = glRef.current;
    const program = programRef.current;

    if (!gl || !program) return;
    x = Math.floor(x);
    y = Math.floor(y);
    flip_h = flip_h ? 1 : 0;
    flip_v = flip_v ? 1 : 0;

    const x_sprite = n % (spriteNumber);
    const y_sprite = Math.floor(n / (spriteNumber));

    let u0 = x_sprite * spriteSheet.spriteSize.width / spriteSheet.size.width;
    let v0 = y_sprite * spriteSheet.spriteSize.height / spriteSheet.size.height;
    let u1 = (x_sprite + width) * spriteSheet.spriteSize.width / spriteSheet.size.width;
    let v1 = (y_sprite + height) * spriteSheet.spriteSize.height / spriteSheet.size.height;

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
      width * spriteSheet.spriteSize.width,
      height * spriteSheet.spriteSize.height
    );

    batchedVertices.push(...vertices);
    batchedUVs.push(...uv);
  }

  function clear(n: number) {
    const gl = glRef.current;
    if (!gl) return;
    if (n * 4 >= palette.length) {
      console.error("Palette index out of bounds");
      return;
    }
    const r = palette[n * 4] / 255;
    const g = palette[n * 4 + 1] / 255;
    const b = palette[n * 4 + 2] / 255;
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  return (
    <canvas
      ref={canvasRef}
      width={screenSize.width}
      height={screenSize.height}
      className={className}
    />
  );
});

const StyledCanvas = styled(Canvas)`
  image-rendering: pixelated;
  width: 100%;

`;

export default StyledCanvas;