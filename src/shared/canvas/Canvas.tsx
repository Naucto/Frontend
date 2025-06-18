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
  spriteSheet,
  palette,
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
  const rendererHandle = useSpriteRenderer(canvasRef, spriteSheet, palette, screenSize);

  useImperativeHandle(ref, () => rendererHandle, [rendererHandle]);
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
