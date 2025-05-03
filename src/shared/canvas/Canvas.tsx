import { SpriteRendererHandle, useSpriteRenderer } from "@shared/canvas/RendererHandle";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { SpriteSheet } from "src/types/SpriteSheetType";
import styled from "styled-components";


type CanvasProps = {
  spriteSheet: SpriteSheet;
  screenSize: {
    width: number;
    height: number;
  };
  palette: Uint8Array;
  className?: string;
};

const Canvas = forwardRef<SpriteRendererHandle, CanvasProps>(({ screenSize, spriteSheet, palette, className }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererHandle = useSpriteRenderer(canvasRef, spriteSheet, palette, screenSize);

  useImperativeHandle(ref, () => rendererHandle, [rendererHandle]);
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
