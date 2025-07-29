import { useState, useEffect, useRef } from "react";
import { colorPalette } from "./Color";
import "./SpriteEditor.css";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import React from "react";
import { StyledCanvas } from "@shared/canvas/Canvas";
import { SpriteSheet } from "src/types/SpriteSheetType";
import { spriteTable, palette } from "src/temporary/SpriteSheet";
import { EditorProps } from "../../create/game-editor/editors/EditorType";
import { YSpriteSheet } from "@modules/create/game-editor/types/YSpriteSheet.ts";
import { RemoteCursors } from "../../cursor-sync/RemoteCursors";
import { useTabContext } from "@modules/create/game-editor/context/TabContext";

interface Point {
  x: number;
  y: number;
}

const SPRITE_SIZE = 8;
const SPRITE_SHEET_SIZE = 128;

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
  screenSize,
  onWheel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseEnter,
  onMouseLeave,
  onClick
}) => (
  <div ref={containerRef} className="draw-canvas-container">
    <StyledCanvas
      ref={canvasRef}
      spriteSheet={spriteSheet}
      screenSize={screenSize}
      palette={palette}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    />
  </div>
);

function getMousePosition(e: React.MouseEvent<HTMLCanvasElement, MouseEvent>, rect: DOMRect): Point {
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

function getScaledPosition(mousePos: Point, rect: DOMRect, zoom: number): Point {
  return {
    x: mousePos.x / (rect.width / zoom),
    y: mousePos.y / (rect.width / zoom)
  };
}

function getPixelPos(
  e: React.MouseEvent<HTMLCanvasElement, MouseEvent>,
  rect: DOMRect,
  zoom: number,
  position: Point
): Point {
  const mousePos = getMousePosition(e, rect);
  const scaledPos = getScaledPosition(mousePos, rect, zoom);

  const rawX = Math.floor(scaledPos.x * SPRITE_SIZE - Math.floor(position.x));
  const rawY = Math.floor(scaledPos.y * SPRITE_SIZE - Math.floor(position.y));

  const x = ((rawX % SPRITE_SIZE) + SPRITE_SIZE) % SPRITE_SIZE;
  const y = ((rawY % SPRITE_SIZE) + SPRITE_SIZE) % SPRITE_SIZE;

  return { x, y };
}

function getSpritePos(
  e: React.MouseEvent<HTMLCanvasElement, MouseEvent>,
  rect: DOMRect,
  zoom: number,
  position: Point
): Point | null {
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

export const SpriteEditor: React.FC<EditorProps> = ({ ydoc, provider, onGetData, onSetData }) => {
  const [currentColor, setCurrentColor] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [isMouseOverCanvas, setIsMouseOverCanvas] = useState(false);
  const [version, setVersion] = useState(0);
  const drawCanvasRef = React.createRef<SpriteRendererHandle>();
  const canvasContainerRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const yspriteRef = useRef<YSpriteSheet>(null);

  const zoomRef = useRef<number>(1);
  const positionRef = useRef<Point>({ x: 0, y: 0 });

  const [, setZoomState] = useState(zoomRef.current);
  const [, setPositionState] = useState(positionRef.current);

  const { activeTab } = useTabContext();
  const isActiveTab = activeTab === 'sprite';

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
  };

  const handleWheel = (e: React.WheelEvent): void => {
    if (!isMouseOverCanvas)
      return;

    const delta = e.deltaY > 0 ? 0.1 : -0.1;
    const power = 5;
    zoomRef.current = Math.max(1, zoomRef.current + delta * power);
    zoomRef.current = Math.min(Math.round(zoomRef.current * 10) / 10, 16);
    setZoomState(zoomRef.current);
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
    if (!onSetData)
      return;
    onSetData((data: string) => {
      if (!yspriteRef.current)
        return;
      ydoc!.transact(() => {
        yspriteRef.current?.fromString(data ? data : spriteTable.table);
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
      drawCanvasRef.current.queueSpriteDraw(0, positionRef.current.x, positionRef.current.y, 16, 16);
      drawCanvasRef.current.draw();
    }
  }, [yspriteRef, drawCanvasRef, positionRef.current, version]);

  const handleClick = (x: number, y: number): void => {
    if (!yspriteRef.current)
      return;

    const color = currentColor;
    ydoc!.transact(() => {
      yspriteRef.current?.setPixel(x, y, color);
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
      const zoom = zoomRef.current;
      const position = positionRef.current;
      const spriteX = Math.floor(((e.clientX - rect.left) / rect.width * zoom) - (Math.floor(position.x) / SPRITE_SIZE));
      const spriteY = Math.floor(((e.clientY - rect.top) / rect.height * zoom) - (Math.floor(position.y) / SPRITE_SIZE));
      const x = Math.floor((e.clientX - rect.left) / (rect.width / zoom) * SPRITE_SIZE - Math.floor(position.x)) % SPRITE_SIZE;
      const y = Math.floor((e.clientY - rect.top) / (rect.width / zoom) * SPRITE_SIZE - Math.floor(position.y)) % SPRITE_SIZE;
      const spriteIndex = x + spriteX * SPRITE_SIZE;
      const pixelIndex = y + spriteY * SPRITE_SIZE;
      handleClick(spriteIndex, pixelIndex);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (isDragging) {
      const zoom = zoomRef.current;
      const dragDistanceX = (e.clientX - dragStart.x) * zoom / 48;
      const dragDistanceY = (e.clientY - dragStart.y) * zoom / 48;

      positionRef.current = {
        x: positionRef.current.x + dragDistanceX,
        y: positionRef.current.y + dragDistanceY
      };
      setPositionState(positionRef.current);

      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (isDrawing) {
      const rect = e.currentTarget.getBoundingClientRect();
      const zoom = zoomRef.current;
      const position = positionRef.current;
      const spritePos = getSpritePos(e, rect, zoom, position);

      if (spritePos) {
        const { x, y } = getPixelPos(e, rect, zoom, position);
        const spriteSize = SPRITE_SIZE;
        const spriteIndex = x + spritePos.x * spriteSize;
        const pixelIndex = y + spritePos.y * spriteSize;
        handleClick(spriteIndex, pixelIndex);
      }
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
    width: Math.floor(SPRITE_SIZE * zoomRef.current),
    height: Math.floor(SPRITE_SIZE * zoomRef.current)
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!isDragging && !isDrawing) {
      const rect = e.currentTarget.getBoundingClientRect();
      const zoom = zoomRef.current;
      const position = positionRef.current;
      const spritePos = getSpritePos(e, rect, zoom, position);

      if (spritePos) {
        const { x, y } = getPixelPos(e, rect, zoom, position);
        const spriteIndex = x + spritePos.x * SPRITE_SIZE;
        const pixelIndex = y + spritePos.y * SPRITE_SIZE;
        handleClick(spriteIndex, pixelIndex);
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
          <div style={{ position: "relative", flex: 1 }}>
            <CanvasContainer
              canvasRef={drawCanvasRef}
              containerRef={canvasContainerRef}
              spriteSheet={canvasSpriteSheet}
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
            {provider && provider.awareness && isActiveTab ? (
              <RemoteCursors
                provider={provider}
                containerRef={canvasContainerRef}
                isActiveTab={isActiveTab}
                zoomRef={zoomRef}
                positionRef={positionRef}
                //TODO : drag offset
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export const spriteEditorTabData = {
  title: "Sprite",
  icon: "sprite",
};
