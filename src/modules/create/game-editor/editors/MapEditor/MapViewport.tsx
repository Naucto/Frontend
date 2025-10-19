import React, { createRef, useCallback, useEffect, useMemo, useState } from "react";
import { styled } from "@mui/material/styles";
import { useProject } from "src/providers/ProjectProvider";
import { StyledCanvas } from "src/shared/canvas/Canvas";
import { SpriteRendererHandle } from "src/shared/canvas/RendererHandle.ts";
import { getCanvasPoint2DFromEvent } from "src/utils/canvasUtils.ts";
import { MapManager } from "@utils/MapManager.ts";

const SCREEN_SIZE: Point2D = { x: 320, y: 180 };

const ViewportCanvas = styled(StyledCanvas)();
const ViewportContainer = styled("div")(({ theme }) => ({
  flex: 0.6,
  display: "flex",
  borderRadius: theme.spacing(1),
  backgroundColor: theme.palette.blue[700],
}));

type Props = {
  selectedIndex: number;
};

export const MapViewport: React.FC<Props> = ({ selectedIndex }) => {
  const { project, actions } = useProject();
  if (!project) return null;

  const [offset, setOffset] = useState<Point2D>({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point2D>({ x: 0, y: 0 });

  const spriteRendererHandleRef = createRef<SpriteRendererHandle>();

  const mapManager: MapManager = useMemo(() => new MapManager(project.map), [project.map]);

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): void => {
      const point: Point2D = getCanvasPoint2DFromEvent(e);
      const tile: Point2D = {
        x: Math.floor((point.x - offset.x) / project.spriteSheet.spriteSize.width),
        y: Math.floor((point.y - offset.y) / project.spriteSheet.spriteSize.height),
      };
      const changed = mapManager.setTileAt(tile, selectedIndex);
      if (changed) {
        actions.setMapData(mapManager.getMap().mapData);
      }
    },
    [mapManager, actions, offset, project.spriteSheet.spriteSize, selectedIndex]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): void => {
      switch (e.button) {
        case 0:
          draw(e);
          setIsDrawing(true);
          break;
        case 2:
          setIsDragging(true);
          setDragStart({ x: e.clientX, y: e.clientY });
          break;
      }
    },
    [draw]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): void => {
      if (isDrawing) {
        draw(e);
      } else if (isDragging) {
        const rect = e.currentTarget.getBoundingClientRect();
        const dragDelta: Point2D = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
        setDragStart({ x: e.clientX, y: e.clientY });
        setOffset((prev) => ({
          x: prev.x + (dragDelta.x / rect.width) * SCREEN_SIZE.x,
          y: prev.y + (dragDelta.y / rect.height) * SCREEN_SIZE.y,
        }));
      }
    },
    [isDrawing, isDragging, draw, dragStart]
  );

  const handleMouseUp = useCallback((): void => {
    setIsDrawing(false);
    setIsDragging(false);
  }, []);

  useEffect(() => {
    spriteRendererHandleRef.current?.drawMap(offset.x, offset.y);
  }, [spriteRendererHandleRef]);

  return (
    <ViewportContainer onContextMenu={(e) => e.preventDefault()}>
      <ViewportCanvas
        ref={spriteRendererHandleRef}
        spriteSheet={project.spriteSheet}
        palette={project.palette}
        map={project.map}
        screenSize={{ width: SCREEN_SIZE.x, height: SCREEN_SIZE.y }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </ViewportContainer>
  );
};
