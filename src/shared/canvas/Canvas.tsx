import { SpriteRendererHandle, useSpriteRenderer } from "@shared/canvas/RendererHandle";
import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { SpriteProvider } from "src/providers/editors/SpriteProvider";
import styled from "styled-components";
import { MapProvider } from "src/providers/editors/MapProvider.ts";

export type CanvasProps = React.CanvasHTMLAttributes<HTMLCanvasElement> & {
  sprite: SpriteProvider;
  map: MapProvider;
  screenSize: {
    width: number;
    height: number;
  };
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onWheel?: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  onMouseDown?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseLeave?: () => void;
  onMouseEnter?: () => void;
};

const Canvas = forwardRef<SpriteRendererHandle, CanvasProps>(({
  screenSize,
  sprite,
  map,
  className,
  onClick,
  onWheel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onMouseEnter
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererHandle = useSpriteRenderer(canvasRef, sprite, map, screenSize);

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
      onClick={onClick}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onMouseEnter={onMouseEnter}
    />
  );
});

export const StyledCanvas = styled(Canvas).attrs<CanvasProps>(props => ({
  onClick: props.onClick,
  onWheel: props.onWheel,
  onMouseDown: props.onMouseDown,
  onMouseMove: props.onMouseMove,
  onMouseUp: props.onMouseUp,
  onMouseLeave: props.onMouseLeave,
  onMouseEnter: props.onMouseEnter
}))`
  image-rendering: pixelated;
  width: 100%;
`;
