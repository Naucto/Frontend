import { DrawTool } from "@modules/editor/SpriteEditor/SpriteEditor";
import React, { useEffect, useRef } from "react";
import { SpriteProvider } from "@providers/editors/SpriteProvider";

type Point2D = { x: number; y: number };
type CanvasHandler = ((e: React.MouseEvent<HTMLCanvasElement>, pixelPos: Point2D) => void) | undefined;

const Tools: React.FC<{
  color: number;
  position: Point2D;
  drawTool: DrawTool;
  onSelectTool: (tool: DrawTool) => void;
  spriteCanvas: SpriteProvider;
  setOnMouseMove?: (fn: CanvasHandler) => void;
  setOnMouseUp?: (fn: CanvasHandler) => void;
  setOnMouseDown?: (fn: CanvasHandler) => void;
}> = ({ drawTool, onSelectTool, setOnMouseDown, setOnMouseMove, setOnMouseUp, spriteCanvas, color }) => {
  const lastPosRef = useRef<Point2D | null>(null);

  // FIX IT TO MAKE IT WORK PROPERLY ON COLLABORATIVE EDITING
  const floodFillAt = (sx: number, sy: number, newColor: number): void => {
    let startColor: number;
    try {
      startColor = spriteCanvas.getPixel(sx, sy);
    } catch (err) {
      console.error("Flood fill start position out of bounds", err); //TODO CUSTOM ERROR HANDLING
      return;
    }
    if (startColor === newColor) return;

    const stack: [number, number][] = [[sx, sy]];
    const visited = new Set<string>();

    while (stack.length) {
      const [x, y] = stack.pop()!;
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);

      let curColor: number;
      try {
        curColor = spriteCanvas.getPixel(x, y);
      } catch (err) {
        console.error("Flood fill position out of bounds", err); //TODO CUSTOM ERROR HANDLING
        continue;
      }
      if (curColor !== startColor) continue;

      spriteCanvas.setPixel(x, y, newColor);

      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }

  };

  const drawLineBresenham = (a: Point2D, b: Point2D) : void => {
    let x0 = a.x | 0;
    let y0 = a.y | 0;
    const x1 = b.x | 0;
    const y1 = b.y | 0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      spriteCanvas.setPixel(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  };
  useEffect(() => {
    setOnMouseDown?.(undefined);
    setOnMouseMove?.(undefined);
    setOnMouseUp?.(undefined);
    lastPosRef.current = null;

    if (drawTool === DrawTool.Pen) {
      const down: CanvasHandler = (_e, pos) => {
        spriteCanvas.setPixel(pos.x, pos.y, color);
        lastPosRef.current = pos;
      };

      const move: CanvasHandler = (_e, pos) => {
        const last = lastPosRef.current;
        if (!last) {
          spriteCanvas.setPixel(pos.x, pos.y, color);
          lastPosRef.current = pos;
          return;
        }
        drawLineBresenham(last, pos);
        lastPosRef.current = pos;
      };

      const up: CanvasHandler = (_e, pos) => {
        const last = lastPosRef.current;
        if (last) {
          drawLineBresenham(last, pos);
        } else {
          spriteCanvas.setPixel(pos.x, pos.y, color);
        }
        lastPosRef.current = null;
      };

      setOnMouseDown?.(down);
      setOnMouseMove?.(move);
      setOnMouseUp?.(up);
      return;
    }

    if (drawTool === DrawTool.Fill) {
      const down: CanvasHandler = (_e, pos) => {
        floodFillAt(pos.x, pos.y, color);
      };

      setOnMouseDown?.(down);
      return;
    }

  }, [drawTool, setOnMouseDown, setOnMouseMove, setOnMouseUp, spriteCanvas, color]);

  return (
    <div className="tools-container">
      <button className={drawTool === DrawTool.Pen ? "active" : ""} onClick={() => onSelectTool(DrawTool.Pen)}>Pen</button>
      {/* FILL commented because not working properly on collaborative editing */}
      {/* <button className={drawTool === DrawTool.Fill ? "active" : ""} onClick={() => onSelectTool(DrawTool.Fill)}>Fill</button> */}
    </div>
  );
};

export default Tools;
