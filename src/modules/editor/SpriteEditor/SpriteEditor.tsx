import { WebrtcProvider } from "y-webrtc";
import { Doc } from "yjs";
import { useState, useEffect, useRef } from "react";
import { colorPalette01 } from "./Color";
import "./SpriteEditor.css";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import React from "react";
import StyledCanvas from "@shared/canvas/Canvas";
import { SpriteSheet } from "src/types/SpriteSheetType";
import { spriteTable, palette } from "src/temporary/SpriteSheet";


interface SpriteEditorProps {
  doc?: Doc;
  provider?: WebrtcProvider;
}

export const SpriteEditor: React.FC<SpriteEditorProps> = ({ doc, provider }) => {
  const [currentColor, setCurrentColor] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMouseOverCanvas, setIsMouseOverCanvas] = useState(false);
  const [editableSpriteTable, setEditableSpriteTable] = useState(spriteTable);
  const drawCanvasRef = React.createRef<SpriteRendererHandle>();
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const preventContextMenu = (e: MouseEvent) => {
      if (e.button === 2) {
        e.preventDefault();
      }
    };

    window.addEventListener('contextmenu', preventContextMenu);

    return () => {
      window.removeEventListener('contextmenu', preventContextMenu);
    };
  }, []);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const preventScroll = (e: WheelEvent) => {
      e.preventDefault();
    };

    container.addEventListener('wheel', preventScroll, { passive: false });
    return () => {
      container.removeEventListener('wheel', preventScroll);
    };
  }, []);

  useEffect(() => {
    if (drawCanvasRef.current) {
      drawCanvasRef.current.clear(0);
      drawCanvasRef.current.queueSpriteDraw(0, position.x, position.y, 16, 16);
      drawCanvasRef.current.draw();
    }
  }, [editableSpriteTable, drawCanvasRef, position]);

  const canvasSpriteSheet: SpriteSheet = {
    spriteSheet: editableSpriteTable,
    spriteSize: {
      width: 8,
      height: 8
    },
    size: {
      width: 128,
      height: 128,
    },
    stride: 1
  };

  const DrawCanvasSize = {
    width: Math.floor(8 * zoom),
    height: Math.floor(8 * zoom)
  };



  useEffect(() => {
    if (doc && provider) {
    }
  }, [doc, provider]);

  const handleClick = (x: number, y: number) => {
    const spriteArray = editableSpriteTable.split('');

    const index = y * canvasSpriteSheet.size.width + x;

    spriteArray[index] = currentColor.toString(16);

    const newSpriteTable = spriteArray.join('');

    setEditableSpriteTable(newSpriteTable);
  };

  const changeColor = (index: number) => {
    setCurrentColor(index);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const delta = e.deltaY > 0 ? 0.1 : -0.1;
    const power = 5;
    setZoom(prevZoom => {
      const newZoom = Math.max(1, prevZoom + delta * power);
      return Math.round(newZoom * 10) / 10;
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMouseOverCanvas) return;
    if (e.button !== 2) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;

    const dx = ((e.clientX - dragStart.x) * zoom) / 48;
    const dy = ((e.clientY - dragStart.y) * zoom) / 48;

    setPosition(prevPos => ({
      x: prevPos.x + dx,
      y: prevPos.y + dy
    }));

    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2) {
      setIsDragging(false);
    }
  };

  return (
    <div className="editor-layout">
      <div className="canvas-container">
        <div className="sprite-editor-header">
          <div className="color-selector">
            {colorPalette01.map((color, index) => (
              <button
                key={color.name}
                onClick={() => changeColor(index)}
                style={{ backgroundColor: color.hex }}
                className={`color-button ${currentColor === index ? "selected" : ""}`}
                title={color.name}
              />
            ))}
          </div>
          <div ref={canvasContainerRef} className="draw-canvas-container">
            <StyledCanvas
              ref={drawCanvasRef}
              spriteSheet={canvasSpriteSheet}
              screenSize={DrawCanvasSize}
              palette={palette}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseEnter={() => setIsMouseOverCanvas(true)}
              onMouseLeave={() => {
                setIsMouseOverCanvas(false);
                setIsDragging(false);
              }}
              onClick={(e: React.MouseEvent<HTMLCanvasElement>) => {
                if (!isDragging) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const spriteX = Math.floor(((e.clientX - rect.left) / rect.width * zoom) - (Math.floor(position.x) / 8));
                  const spriteY = Math.floor(((e.clientY - rect.top) / rect.height * zoom) - (Math.floor(position.y) / 8));
                  const x = Math.floor((e.clientX - rect.left) / (rect.width / zoom) * 8 - Math.floor(position.x)) % 8;
                  const y = Math.floor((e.clientY - rect.top) / (rect.width / zoom) * 8 - Math.floor(position.y)) % 8;
                  const spriteIndex = x + spriteX * 8;
                  const pixelIndex = y + spriteY * 8;
                  handleClick(spriteIndex, pixelIndex);
                }
              }}
            />
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



