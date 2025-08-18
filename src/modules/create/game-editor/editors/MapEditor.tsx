
import React from "react";
import { EditorProps } from "./EditorType";
import { styled } from "@mui/material/styles";
import { useProject } from "src/providers/ProjectProvider";
import { StyledCanvas } from "src/shared/canvas/Canvas.tsx";
import { SpriteRendererHandle } from "src/shared/canvas/RendererHandle.ts";
import { getCanvasPoint2DFromEvent } from "src/utils/canvasUtils.ts";
import { MapManager } from "@utils/MapManager.ts";

const SCREEN_SIZE : Point2D = { x: 320, y: 180 };

const MapEditorCanvas = styled(StyledCanvas)(({ theme }) => ({
}));

const MapEditorContainer = styled("div")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  borderRadius: theme.spacing(1),
  borderTopLeftRadius: 0,
  backgroundColor: theme.palette.blue[800],
  gap: theme.spacing(1),
  boxSizing: "border-box",
  padding: theme.spacing(1),
}));

const Top = styled("div")(({ theme }) => ({
  flex: 0.6,
  display: "flex",
  borderRadius: theme.spacing(1),
  backgroundColor: theme.palette.blue[700],

}));
const Bottom = styled("div")(({ theme }) => ({
  flex: 0.4,
  display: "flex",
  borderRadius: theme.spacing(1),
  backgroundColor: theme.palette.blue[700],
}));

export const MapEditor: React.FC<EditorProps> = () => {
  const { project } = useProject();
  if (!project) {
    return <div>Loading...</div>;
  }

  const [offset, setOffset] = useState<Point2D>({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point2D>({ x: 0, y: 0 });
  const spriteRendererHandleRef = useRef<SpriteRendererHandle>(null);
  const mapManager: MapManager = useMemo(() => {
    return new MapManager(project.map);
  }, [project.map]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>): void => {
    const point: Point2D = getCanvasPoint2DFromEvent(e);
    const tile: Point2D = {
      x: Math.floor((point.x - offset.x) / project.spriteSheet.spriteSize.width),
      y: Math.floor((point.y - offset.y) / project.spriteSheet.spriteSize.height)
    };
    const changed = mapManager.setTileAt(tile, 13);
    if (changed) {
      actions.setMapData(mapManager.getMap().mapData);
    }

  }, [mapManager, actions, offset]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!spriteRendererHandleRef.current) return;
    switch (e.button) {
      case 0: // Left mouse button
        draw(e);
        setIsDrawing(true);
        break;
      case 2: // Right mouse button
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        break;
    }
  }, [draw]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!spriteRendererHandleRef.current) return;
    if (isDrawing) {
      draw(e);
    } else if (isDragging) {
      const rect = e.currentTarget.getBoundingClientRect();
      const dragDelta: Point2D = {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      };
      setDragStart({ x: e.clientX, y: e.clientY });
      setOffset((prevOffset) => ({
        x: prevOffset.x + dragDelta.x / rect.width * SCREEN_SIZE.x,
        y: prevOffset.y + dragDelta.y / rect.height * SCREEN_SIZE.y
      }));
    }
  }, [isDrawing, isDragging, draw, dragStart]);

  const handleMouseUp = useCallback((): void => {
    setIsDrawing(false);
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const spriteRendererHandle = spriteRendererHandleRef.current;
    if (!spriteRendererHandle) return;
    spriteRendererHandle.drawMap(offset.x, offset.y);
  }, [spriteRendererHandleRef, project, isDrawing, offset, isDragging]);

  return (
    <MapEditorContainer onContextMenu={(e) => e.preventDefault()}>
      <Top>
        <MapEditorCanvas
          ref={spriteRendererHandleRef}
          spriteSheet={project.spriteSheet}
          palette={project.palette}
          map={project.map}
          screenSize={{ width: SCREEN_SIZE.x , height: SCREEN_SIZE.y }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />
      </Top>
      <Bottom />
    </MapEditorContainer >
  );
};
