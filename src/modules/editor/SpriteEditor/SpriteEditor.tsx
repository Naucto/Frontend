import { useState, useEffect, useRef } from "react";
import { colorPalette } from "./Color";
import "./SpriteEditor.css";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import React from "react";
import { StyledCanvas } from "@shared/canvas/Canvas";
import { SpriteSheet } from "src/types/SpriteSheetType";
import { palette } from "src/temporary/SpriteSheet";
import { EditorProps } from "../../create/game-editor/editors/EditorType";
import { YSpriteSheet } from "@modules/create/game-editor/types/YSpriteSheet.ts";
import { useProject } from "src/providers/ProjectProvider";
import { Map } from "src/types/MapType";
interface Point {
  x: number;
  y: number;
}

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
  <button
    key={color.name}
    onClick={onClick}
    style={{ backgroundColor: color.hex }}
    className={`color-button ${isSelected ? "selected" : ""}`}
    title={color.name}
  />
);

interface ColorPaletteProps {
  colors: typeof colorPalette;
  currentColor: number;
  onColorSelect: (index: number) => void;
}

const ColorPalette: React.FC<ColorPaletteProps> = ({ colors, currentColor, onColorSelect }) => (
  <div className="color-selector">
    {colors.map((color, index) => (
      <ColorButton
        key={color.name}
        color={color}
        isSelected={currentColor === index}
        onClick={() => onColorSelect(index)}
      />
    ))}
  </div>
);

interface CanvasContainerProps {
  canvasRef: React.RefObject<SpriteRendererHandle | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  spriteSheet: SpriteSheet;
  map: Map;
  screenSize: { width: number; height: number };
  onWheel: (e: React.WheelEvent) => void;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

const CanvasContainer: React.FC<CanvasContainerProps> = ({
  canvasRef,
  containerRef,
  spriteSheet,
  map,
  screenSize,
  ...props
}) => (
  <div ref={containerRef} className="draw-canvas-container">
    <StyledCanvas
      ref={canvasRef}
      spriteSheet={spriteSheet}
      screenSize={screenSize}
      palette={palette}
      map={map}
      {...props}
    />
  </div>
);

function getMousePosition(e: React.MouseEvent<HTMLCanvasElement, MouseEvent>, rect: DOMRect): Point {
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

function getNormalizedPosition(mousePos: Point, rect: DOMRect): Point {
  return {
    x: mousePos.x / rect.width,
    y: mousePos.y / rect.height
  };
}

function getScaledPosition(mousePos: Point, scale: number, zoom: number): Point {
  return {
    x: mousePos.x * zoom * scale,
    y: mousePos.y * zoom * scale
  };
}

function getPixelPos(e: React.MouseEvent<HTMLCanvasElement, MouseEvent>,
  rect: DOMRect, zoom: number, position: Point): Point {

  const canvasMousePos = getMousePosition(e, rect);
  const normalizedMousePos = getNormalizedPosition(canvasMousePos, rect);
  const scaledPos = getScaledPosition(normalizedMousePos, SCALE, zoom);

  const x = Math.floor(scaledPos.x * SPRITE_SIZE - Math.floor(position.x));
  const y = Math.floor(scaledPos.y * SPRITE_SIZE - Math.floor(position.y));

  return { x, y };
}

function getSpritePos(e: React.MouseEvent<HTMLCanvasElement, MouseEvent>,
  rect: DOMRect, zoom: number, position: Point): Point | null {
  const mousePos = getMousePosition(e, rect);

  const spriteX = Math.floor((mousePos.x / rect.width * zoom) - (Math.floor(position.x) / SPRITE_SIZE));
  const spriteY = Math.floor((mousePos.y / rect.height * zoom) - (Math.floor(position.y) / SPRITE_SIZE));

  if (
    spriteX < 0 ||
    spriteX >= SPRITE_SHEET_SIZE / SPRITE_SIZE ||
    spriteY < 0 ||
    spriteY >= SPRITE_SHEET_SIZE / SPRITE_SIZE
  ) {
    return null;
  }

  return { x: spriteX, y: spriteY };
}

export const SpriteEditor: React.FC<EditorProps> = ({ ydoc, onGetData, onSetData }) => {
  const [currentColor, setCurrentColor] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [isMouseOverCanvas, setIsMouseOverCanvas] = useState(false);
  const [version, setVersion] = useState(0);
  const drawCanvasRef = React.createRef<SpriteRendererHandle>();
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const yspriteRef = useRef<YSpriteSheet>(null);
  const { project } = useProject();

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
    yspriteRef.current = new YSpriteSheet(ydoc, "sprite", SPRITE_SHEET_SIZE, SPRITE_SHEET_SIZE);
    if (yspriteRef.current) {
      yspriteRef.current.observe(() => {
        setVersion(v => v + 1);
      });
    }
  }, [yspriteRef]);

  useEffect(() => {
    if (!onGetData)
      return;
    onGetData(() => {
      if (yspriteRef.current) {
        return yspriteRef.current.toString();
      }
      return "";
    });
  }, [onGetData]);

  useEffect(() => {
    if (!project) return;
    if (!onSetData)
      return;
    onSetData((data: string) => {
      if (!yspriteRef.current)
        return;
      ydoc!.transact(() => {
        yspriteRef.current?.fromString(data ? data : project?.spriteSheet.spriteSheet);
      });
    });
  }, [onSetData]);

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
  }, [yspriteRef, drawCanvasRef, position, version, zoom]);

  const drawAt = (x: number, y: number): void => {
    if (!yspriteRef.current)
      return;
    ydoc!.transact(() => {
      yspriteRef.current?.setPixel(x, y, currentColor);
    });
    setVersion(v => v + 1);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!isMouseOverCanvas) return;

    if (e.button === 2) { // Right click
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (e.button === 0) { // Left click
      setIsDrawing(true);
      const rect = e.currentTarget.getBoundingClientRect();
      const { x, y } = getPixelPos(e, rect, zoom, position);
      drawAt(x, y);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (isDragging) {
      const dragDelta: Point = {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      };
      if (canvasContainerRef.current === null) return;
      const normalizedDragDelta = getNormalizedPosition(dragDelta, canvasContainerRef.current.getBoundingClientRect());

      const dragDistance: Point = {
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
      drawAt(x, y);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (e.button === 2) {
      setIsDragging(false);
    } else if (e.button === 0) {
      setIsDrawing(false);
    }
  };

  const canvasSpriteSheet: SpriteSheet = {
    spriteSheet: yspriteRef.current ? yspriteRef.current.toString() : "",
    spriteSize: {
      width: SPRITE_SIZE,
      height: SPRITE_SIZE
    },
    size: {
      width: SPRITE_SHEET_SIZE,
      height: SPRITE_SHEET_SIZE,
    },
    stride: 1
  };

  const drawCanvasSize = {
    width: Math.floor(SPRITE_SHEET_SIZE) * SCALE,
    height: Math.floor(SPRITE_SHEET_SIZE) * SCALE
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!isDragging && !isDrawing) {
      const rect = e.currentTarget.getBoundingClientRect();
      const spritePos = getSpritePos(e, rect, zoom, position);

      if (spritePos) {
        const { x, y } = getPixelPos(e, rect, zoom, position);
        drawAt(x, y);
      }
    }
  };
  return (
    <div className="editor-layout" onContextMenu={handleContextMenu}>
      <div className="canvas-container">
        <div className="sprite-editor-header">
          <ColorPalette
            colors={colorPalette}
            currentColor={currentColor}
            onColorSelect={setCurrentColor}
          />
          {project && (
            <CanvasContainer
              canvasRef={drawCanvasRef}
              containerRef={canvasContainerRef}
              spriteSheet={canvasSpriteSheet}
              map={project.map}
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
              onClick={handleCanvasClick}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export const spriteEditorTabData = {
  title: "Sprite",
  icon: "sprite",
};
