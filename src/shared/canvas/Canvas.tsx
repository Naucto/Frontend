import { SpriteRendererHandle, useSpriteRenderer } from "@shared/canvas/RendererHandle";
import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { SpriteSheet } from "src/types/SpriteSheetType";
import { styled } from "@mui/material/styles";
import { Map } from "src/types/MapType";

export type CanvasProps = React.CanvasHTMLAttributes<HTMLCanvasElement> & {
  spriteSheet: SpriteSheet;
  map: Map;
  screenSize: {
    width: number;
    height: number;
  };
  palette: Uint8Array;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onWheel?: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  onMouseDown?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseLeave?: () => void;
  onMouseEnter?: () => void;
};

const Canvas = forwardRef<SpriteRendererHandle, CanvasProps>(function Canvas(
  { screenSize,
    spriteSheet,
    map,
    palette,
    className,
    ...rest },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererHandle = useSpriteRenderer(canvasRef, spriteSheet, palette, map, screenSize);

  useImperativeHandle(
    ref,
    () => ({
      ...rendererHandle,
      getCanvas: () => canvasRef.current,
    }),
    [rendererHandle]
  );

  return (
    <canvas
      ref={canvasRef}
      width={screenSize.width}
      height={screenSize.height}
      className={className}
      tabIndex={0}
      {...rest}
    />
  );
});

export const StyledCanvas = styled(Canvas)({
  imageRendering: "pixelated",
  maxWidth: "100%",
  maxHeight: "100%",
  width: "auto",
  height: "auto",
});

export default Canvas;
