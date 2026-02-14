import { DrawTool, CanvasHandler } from "@modules/editor/SpriteEditor/SpriteEditor";
import React, { useEffect, useRef } from "react";
import { SpriteProvider } from "@providers/editors/SpriteProvider";
import { SpriteToolError } from "@errors/SpriteToolError";

const Tools: React.FC<{
  color: number;
  position: Point2D;
  drawTool: DrawTool;
  onSelectTool: (tool: DrawTool) => void;
  spriteProvider: SpriteProvider;
  setOnMouseMove?: (fn: CanvasHandler) => void;
  setOnMouseUp?: (fn: CanvasHandler) => void;
  setOnMouseDown?: (fn: CanvasHandler) => void;
}> = ({ drawTool, onSelectTool, setOnMouseDown, setOnMouseMove, setOnMouseUp, spriteProvider: spriteProvider, color }) => {
  const lastPosRef = useRef<Point2D | null>(null);
  const colorRef = useRef(color);

  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  // FIX IT TO MAKE IT WORK PROPERLY ON COLLABORATIVE EDITING
  const floodFillAt = (sx: number, sy: number, newColor: number): void => {
    let startColor: number;
    try {
      startColor = spriteProvider.getPixel(sx, sy);
    } catch (err) {
      throw new SpriteToolError("Flood fill start position out of bounds", "FLOOD_FILL_OUT_OF_BOUNDS", err);
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
        curColor = spriteProvider.getPixel(x, y);
      } catch (err) {
        throw new SpriteToolError("Flood fill position out of bounds", "FLOOD_FILL_OUT_OF_BOUNDS", err);
      }
      if (curColor !== startColor) continue;

      spriteProvider.setPixel(x, y, newColor);

      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }

  };

  const drawLine = (a: Point2D, b: Point2D) : void => {
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
      spriteProvider.setPixel(x0, y0, colorRef.current);
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
        spriteProvider.setPixel(pos.x, pos.y, colorRef.current);
        lastPosRef.current = pos;
      };

      const move: CanvasHandler = (_e, pos) => {
        const last = lastPosRef.current;
        if (!last) {
          spriteProvider.setPixel(pos.x, pos.y, colorRef.current);
          lastPosRef.current = pos;
          return;
        }
        drawLine(last, pos);
        lastPosRef.current = pos;
      };

      const up: CanvasHandler = (_e, pos) => {
        const last = lastPosRef.current;
        if (last) {
          drawLine(last, pos);
        } else {
          spriteProvider.setPixel(pos.x, pos.y, colorRef.current);
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
        floodFillAt(pos.x, pos.y, colorRef.current);
      };

      setOnMouseDown?.(down);
      return;
    }

  }, [drawTool, setOnMouseDown, setOnMouseMove, setOnMouseUp, spriteProvider]);

  return (
    <>
      <button onClick={() => onSelectTool(DrawTool.Pen)}>Pen</button>
      {/* FILL commented because not working properly on collaborative editing */}
      {/* <button className={drawTool === DrawTool.Fill ? "active" : ""} onClick={() => onSelectTool(DrawTool.Fill)}>Fill</button> */}
    </>
  );
};

export default Tools;
