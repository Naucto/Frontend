import { DrawTool, CanvasHandler } from "@modules/editor/SpriteEditor/SpriteEditor";
import React, { useEffect, useRef } from "react";
import { SpriteProvider } from "@providers/editors/SpriteProvider";

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
    if (!spriteProvider.isPixelInBounds(sx, sy)) {
      return;
    }

    const startColor = spriteProvider.getPixel(sx, sy);
    if (startColor === newColor) return;

    const stack: [number, number][] = [[sx, sy]];
    const visited = new Set<string>();

    while (stack.length) {
      const [x, y] = stack.pop()!;
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);

      if (!spriteProvider.isPixelInBounds(x, y)) continue;

      const curColor = spriteProvider.getPixel(x, y);
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

  const drawHLine = (x1: number, x2: number, y: number, color: number): void => {
    for (let x = x1; x <= x2; x++) {
      spriteProvider.setPixel(x, y, color);
    }
  };

  const plotCirclePoints = (xc: number, yc: number, x: number, y: number, color: number): void => {
    spriteProvider.setPixel(xc + x, yc + y, color);
    spriteProvider.setPixel(xc - x, yc + y, color);
    spriteProvider.setPixel(xc + x, yc - y, color);
    spriteProvider.setPixel(xc - x, yc - y, color);
    spriteProvider.setPixel(xc + y, yc + x, color);
    spriteProvider.setPixel(xc - y, yc + x, color);
    spriteProvider.setPixel(xc + y, yc - x, color);
    spriteProvider.setPixel(xc - y, yc - x, color);
  };

  const drawCircle = (xc: number, yc: number, radius: number, color: number, fill = false): void => {
    let x = radius;
    let y = 0;
    let err = 1 - radius;

    while (x >= y) {
      if (fill) {
        drawHLine(xc - x, xc + x, yc + y, color);
        drawHLine(xc - y, xc + y, yc + x, color);
        drawHLine(xc - x, xc + x, yc - y, color);
        drawHLine(xc - y, xc + y, yc - x, color);
      } else {
        plotCirclePoints(xc, yc, x, y, color);
      }
      y++;
      if (err < 0) {
        err += 2 * y + 1;
      } else {
        x--;
        err += 2 * (y - x) + 1;
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

    if (drawTool === DrawTool.Circle) {
      const down: CanvasHandler = (_e, pos) => {
        lastPosRef.current = pos;
      };

      //TODO: Implement circle preview
      /* const move: CanvasHandler = (_e, pos) => {
        const last = lastPosRef.current;
        if (!last) {
          return;
        }
      }; */

      const up: CanvasHandler = (_e, pos) => {
        const last = lastPosRef.current;
        if (last) {
          const radius = Math.floor(Math.sqrt((pos.x - last.x) ** 2 + (pos.y - last.y) ** 2));
          drawCircle(last.x, last.y, radius, colorRef.current, false);
        } else {
          drawCircle(pos.x, pos.y, 1, colorRef.current, false);
        }
        lastPosRef.current = null;
      };

      setOnMouseDown?.(down);
      //setOnMouseMove?.(move);
      setOnMouseUp?.(up);
      return;
    }

    if (drawTool === DrawTool.Rectangle) {
      // TODO: Implement rectangle drawing
      return;
    }
    if (drawTool === DrawTool.Line) {
      // TODO: Implement line drawing
      return;
    }

  }, [drawTool, setOnMouseDown, setOnMouseMove, setOnMouseUp, spriteProvider]);

  return (
    <>
      <button onClick={() => onSelectTool(DrawTool.Pen)}>Pen</button>
      <button onClick={() => onSelectTool(DrawTool.Circle)}>Circle</button>
      {/* FILL commented because not working properly on collaborative editing */}
      {/* <button className={drawTool === DrawTool.Fill ? "active" : ""} onClick={() => onSelectTool(DrawTool.Fill)}>Fill</button> */}
    </>
  );
};

export default Tools;
