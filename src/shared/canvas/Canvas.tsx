import { SpriteRendererHandle, useSpriteRenderer } from "@shared/canvas/RendererHandle";
import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { SpriteProvider } from "@providers/editors/SpriteProvider";
import { styled } from "@mui/material/styles";
import { MapProvider } from "@providers/editors/MapProvider.ts";

export type CanvasProps = React.CanvasHTMLAttributes<HTMLCanvasElement> & {
  sprite: SpriteProvider;
  map: MapProvider;
  screenSize: {
    width: number;
    height: number;
  };
  className?: string;
};

const Canvas = forwardRef<SpriteRendererHandle, CanvasProps>(function Canvas(
  { screenSize,
    sprite,
    map,
    className,
    ...rest },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererHandle = useSpriteRenderer(canvasRef, sprite, map, screenSize);

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
