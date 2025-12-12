import React, { createRef, useCallback, useEffect, useState } from "react";
import { styled } from "@mui/material/styles";
import { StyledCanvas } from "src/shared/canvas/Canvas";
import { SpriteRendererHandle } from "src/shared/canvas/RendererHandle.ts";
import { getCanvasPoint2DFromEvent } from "src/utils/canvasUtils.ts";
import { ProjectProvider } from "@providers/ProjectProvider";

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
  project: ProjectProvider;
};

export const MapViewport: React.FC<Props> = ({ selectedIndex, project }) => {
  const [offset, setOffset] = useState<Point2D>({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point2D>({ x: 0, y: 0 });
  const [, setVersion] = useState(0);

  const spriteRendererHandleRef = createRef<SpriteRendererHandle>();

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): void => {
      const point: Point2D = getCanvasPoint2DFromEvent(e);
      const tile: Point2D = {
        x: Math.floor((point.x - offset.x) / project.spriteProvider.spriteSize.width),
        y: Math.floor((point.y - offset.y) / project.spriteProvider.spriteSize.height),
      };
      project.mapProvider.setTileAt(tile, selectedIndex);
      setVersion(v => v + 1);

    },
    [offset, project.spriteProvider.spriteSize, selectedIndex]
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

  useEffect(() => {
    project.mapProvider.observe(() => {
      setVersion(v => v + 1);
    });

    project.spriteProvider.observe(() => {
      setVersion(v => v + 1);
    });
  }, [project]);

  return (
    <ViewportContainer onContextMenu={(e) => e.preventDefault()}>
      <ViewportCanvas
        ref={spriteRendererHandleRef}
        sprite={project.spriteProvider}
        map={project.mapProvider}
        screenSize={{ width: SCREEN_SIZE.x, height: SCREEN_SIZE.y }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </ViewportContainer>
  );
};
