import { SpriteRendererHandle, useSpriteRenderer } from "@shared/canvas/RendererHandle";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { SpriteSheet } from "src/types/SpriteSheetType";
import styled from "styled-components";

export type CanvasProps = React.CanvasHTMLAttributes<HTMLCanvasElement> & {
  spriteSheet: SpriteSheet;
  screenSize: {
    width: number;
    height: number;
  };
  palette: Uint8Array;
  className?: string;
};

export type CanvasHandle = SpriteRendererHandle & {
  getCanvas: () => HTMLCanvasElement | null;
};

const Canvas = forwardRef<CanvasHandle, CanvasProps>(({ screenSize, spriteSheet, palette, className, ...props }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererHandle = useSpriteRenderer(canvasRef, spriteSheet, palette, screenSize);

  useImperativeHandle(ref, () => ({
    ...rendererHandle,
    getCanvas: () => canvasRef.current,
  }), [rendererHandle]);

  return (
    <canvas
      ref={canvasRef}
      width={screenSize.width}
      height={screenSize.height}
      className={className}
      tabIndex={0}
      {...props}
    />
  );
});

const StyledCanvas = styled(Canvas)`
  image-rendering: pixelated;
  width: 100%;
  outline: none;
`;

export default StyledCanvas;
