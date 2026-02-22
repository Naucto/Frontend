import { useState, useEffect, useRef, useCallback } from "react";
import { colorPalette } from "./Color";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import React from "react";
import { StyledCanvas } from "@shared/canvas/Canvas";
import { EditorProps } from "../../create/game-editor/editors/EditorType";
import { MapProvider } from "@providers/editors/MapProvider.ts";
import { SpriteProvider } from "@providers/editors/SpriteProvider.ts";
import { styled } from "@mui/material";
import Tools from "@modules/editor/SpriteEditor/Tools";

export enum DrawTool {
  Pen,
  Fill,
  Line, // TODO
  Rectangle, // TODO
}
export type CanvasHandler = ((e: React.MouseEvent<HTMLCanvasElement>, pixelPos: Point2D) => void) | undefined;

const SPRITE_SIZE = 8;
const SPRITE_SHEET_SIZE = 128;
const SPRITE_NUMBER = SPRITE_SHEET_SIZE / SPRITE_SIZE;
const CANVAS_BASE_RESOLUTION = 1080; // Base resolution for scaling the canvas
const SCALE = CANVAS_BASE_RESOLUTION / SPRITE_SHEET_SIZE; // used to scale the canvas to avoid 1:1 pixel scaling
const ZOOM_LIMIT = SPRITE_NUMBER / SCALE;

interface ColorButtonProps {
  color: { name: string; hex: string };
  isSelected: boolean;
  onClick: () => void;
}

const ColorButton: React.FC<ColorButtonProps> = ({ color, isSelected, onClick }) => (
  <ColorButtonStyled
    key={color.name}
    onClick={onClick}
    style={{ backgroundColor: color.hex }}
    $selected={isSelected}
    title={color.name}
  />
);

interface ColorPaletteProps {
  colors: typeof colorPalette;
  currentColor: number;
  onColorSelect: (index: number) => void;
}

const ColorPalette: React.FC<ColorPaletteProps> = ({ colors, currentColor, onColorSelect }) => (
  <ColorSelector>
    {colors.map((color, index) => (
      <ColorButton
        key={color.name}
        color={color}
        isSelected={currentColor === index}
        onClick={() => onColorSelect(index)}
      />
    ))}
  </ColorSelector>
);

const Left = styled("div")(() => ({
  display: "flex",
  flexDirection: "column",
  padding: "0.5rem",
}));

const EditorLayout = styled("div")(() => ({
  display: "flex",
  flexDirection: "column",
  height: "70%",
  padding: "1rem",
  backgroundColor: "#537D8D",
  color: "#ffffff",
}));

const CanvasContainerWrapper = styled("div")(() => ({
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  height: "100%",
}));

const SpriteEditorHeader = styled("div")(() => ({
  display: "flex",
  gap: "1rem",
  width: "100%",
  height: "100%",
}));

const ColorSelector = styled("div")(() => ({
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "0.5rem",
  padding: "4px",
  backgroundColor: "#3a5863",
  borderRadius: "4px",
  width: "100%",
  height: "fit-content",
  alignContent: "start",
  overflowY: "auto",
  overflowX: "hidden",
  scrollbarWidth: "thin",
  scrollbarColor: "#1a2c35 #2a3c45",
}));

const ColorButtonStyled = styled("button", {
  shouldForwardProp: (prop) => prop !== "$selected",
})<{ $selected: boolean }>(({ $selected }) => ({
  aspectRatio: "1",
  width: "40px",
  height: "40px",
  border: `2px solid ${$selected ? "#ffffff" : "#4c4c4c"}`,
  borderRadius: "4px",
  cursor: "pointer",
  transition: "transform 0.1s ease",
  transform: $selected ? "scale(1.1)" : "none",
  "&:hover": {
    transform: "scale(1.1)",
  },
  "&:focus": { outline: "none" },
}));

const DrawCanvasContainer = styled("div")(() => ({
  backgroundColor: "#3a5863",
  padding: "1rem",
  borderRadius: "4px",
}));

interface CanvasContainerProps {
  canvasRef: React.RefObject<SpriteRendererHandle | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  sprite: SpriteProvider;
  map: MapProvider;
  screenSize: { width: number; height: number };
  onWheel: (e: React.WheelEvent) => void;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

const CanvasContainer: React.FC<CanvasContainerProps> = ({
  canvasRef,
  containerRef,
  sprite,
  map,
  screenSize,
  ...props
}) => (
  <DrawCanvasContainer ref={containerRef}>
    <StyledCanvas
      ref={canvasRef}
      sprite={sprite}
      screenSize={screenSize}
      map={map}
      {...props}
    />
  </DrawCanvasContainer>
);

function getMousePosition(e: React.MouseEvent<HTMLCanvasElement, MouseEvent>, rect: DOMRect): Point2D {
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

function getNormalizedPosition(mousePos: Point2D, rect: DOMRect): Point2D {
  return {
    x: mousePos.x / rect.width,
    y: mousePos.y / rect.height
  };
}

function getScaledPosition(mousePos: Point2D, scale: number, zoom: number): Point2D {
  return {
    x: mousePos.x * zoom * scale,
    y: mousePos.y * zoom * scale
  };
}

function getPixelPos(e: React.MouseEvent<HTMLCanvasElement, MouseEvent>,
  rect: DOMRect, zoom: number, position: Point2D): Point2D {

  const canvasMousePos = getMousePosition(e, rect);
  const normalizedMousePos = getNormalizedPosition(canvasMousePos, rect);
  const scaledPos = getScaledPosition(normalizedMousePos, SCALE, zoom);

  const x = Math.floor(scaledPos.x * SPRITE_SIZE - Math.floor(position.x));
  const y = Math.floor(scaledPos.y * SPRITE_SIZE - Math.floor(position.y));

  return { x, y };
}

export const SpriteEditor: React.FC<EditorProps> = ({ project }) => {
  const [currentColor, setCurrentColor] = useState(0);
  const [zoom, setZoom] = useState(1);

  const [drawTool, setDrawTool] = useState<DrawTool>(DrawTool.Pen);
  const onMouseDownRef = useRef<CanvasHandler>(undefined);
  const onMouseMoveRef = useRef<CanvasHandler>(undefined);
  const onMouseUpRef   = useRef<CanvasHandler>(undefined);

  const setOnMouseDown = useCallback((fn: CanvasHandler) => onMouseDownRef.current = fn, []);
  const setOnMouseMove = useCallback((fn: CanvasHandler) => onMouseMoveRef.current = fn, []);
  const setOnMouseUp = useCallback((fn: CanvasHandler) => onMouseUpRef.current = fn, []);

  const [position, setPosition] = useState<Point2D>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<Point2D>({ x: 0, y: 0 });
  const [isMouseOverCanvas, setIsMouseOverCanvas] = useState(false);
  const [version, setVersion] = useState(0);
  const drawCanvasRef = React.createRef<SpriteRendererHandle>();
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
  };

  const handleWheel = (e: React.WheelEvent): void => {
    if (!isMouseOverCanvas)
      return;

    const delta = e.deltaY > 0 ? 1 : -1;
    const power = 1 / SCALE;
    setZoom(prevZoom => {
      const newZoom = Math.max(power, prevZoom + delta * power);
      return Math.min(newZoom, ZOOM_LIMIT);
    });
  };

  useEffect(() => {
    project.spriteProvider.observe(() => setVersion(v => v + 1));

    project.mapProvider.observe(() => setVersion(v => v + 1));
  }, [project]);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const preventScroll = (e: WheelEvent): void => {
      e.preventDefault();
    };

    container.addEventListener("wheel", preventScroll, { passive: false });
    return () => {
      container.removeEventListener("wheel", preventScroll);
    };
  }, []);

  useEffect(() => {
    if (drawCanvasRef.current) {
      drawCanvasRef.current.clear(0);
      const snappedX = Math.floor(position.x);
      const snappedY = Math.floor(position.y);

      drawCanvasRef.current.queueSpriteDraw(
        0,
        snappedX * SPRITE_NUMBER / zoom,
        snappedY * SPRITE_NUMBER / zoom,
        SPRITE_NUMBER, SPRITE_NUMBER,
        0, 0,
        (1 / zoom) * SPRITE_NUMBER);
      drawCanvasRef.current.draw();
    }
  }, [project.spriteProvider, drawCanvasRef, position, version, zoom]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!isMouseOverCanvas) return;

    if (e.button === 2) { // Right click
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (e.button === 0) { // Left click
      setIsDrawing(true);
      const rect = e.currentTarget.getBoundingClientRect();
      const { x, y } = getPixelPos(e, rect, zoom, position);
      onMouseDownRef.current?.(e, { x, y });
      setVersion(v => v + 1);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (isDragging) {
      const dragDelta: Point2D = {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      };
      if (canvasContainerRef.current === null) return;
      const normalizedDragDelta = getNormalizedPosition(dragDelta, canvasContainerRef.current.getBoundingClientRect());

      const dragDistance: Point2D = {
        x: normalizedDragDelta.x * SPRITE_SIZE * zoom * SCALE,
        y: normalizedDragDelta.y * SPRITE_SIZE * zoom * SCALE
      };

      setPosition(prevPos => ({
        x: prevPos.x + dragDistance.x,
        y: prevPos.y + dragDistance.y
      }));

      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (isDrawing) {
      const rect = e.currentTarget.getBoundingClientRect();

      const { x, y } = getPixelPos(e, rect, zoom, position);
      onMouseMoveRef.current?.(e, { x, y });
      setVersion(v => v + 1);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (e.button === 2) {
      setIsDragging(false);
    } else if (e.button === 0) {
      setIsDrawing(false);
    }
  };

  const drawCanvasSize = {
    width: Math.floor(SPRITE_SHEET_SIZE) * SCALE,
    height: Math.floor(SPRITE_SHEET_SIZE) * SCALE
  };

  return (
    <EditorLayout
      onContextMenu={handleContextMenu}
      data-cy="sprite-editor">
      <CanvasContainerWrapper>
        <SpriteEditorHeader>
          <Left>
            <ColorPalette
              colors={colorPalette}
              currentColor={currentColor}
              onColorSelect={setCurrentColor}
            />
            <Tools
              color={currentColor}
              position={position}
              setOnMouseDown={setOnMouseDown}
              setOnMouseMove={setOnMouseMove}
              setOnMouseUp={setOnMouseUp}
              drawTool={drawTool}
              onSelectTool={setDrawTool}
              spriteProvider={project.spriteProvider}
            />
          </Left>
          <CanvasContainer
            canvasRef={drawCanvasRef}
            containerRef={canvasContainerRef}
            sprite={project.spriteProvider}
            map={project.mapProvider}
            screenSize={drawCanvasSize}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseEnter={() => setIsMouseOverCanvas(true)}
            onMouseLeave={() => {
              setIsMouseOverCanvas(false);
              setIsDragging(false);
              setIsDrawing(false);
            }}
          />
        </SpriteEditorHeader>
      </CanvasContainerWrapper>
    </EditorLayout>
  );
};

export const spriteEditorTabData = {
  title: "Sprite",
  icon: "sprite",
};
