import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { colorPalette } from "./Color";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import React from "react";
import { StyledCanvas } from "@shared/canvas/Canvas";
import { EditorProps } from "../../create/game-editor/editors/EditorType";
import { styled } from "@mui/material";
import Tools, { SpritePixelAccessor } from "@modules/editor/SpriteEditor/Tools";

export enum DrawTool {
  Pen,
  Fill,
  Line, // TODO
  Rectangle, // TODO
}
export type CanvasHandler = ((e: React.MouseEvent<HTMLCanvasElement>, pixelPos: Point2D) => void) | undefined;

const TILE_SIZES = [8, 16, 32] as const;
type TileSize = typeof TILE_SIZES[number];

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

const EditorLayout = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "320px minmax(0, 1fr)",
  gap: theme.spacing(2),
  minHeight: 0,
  "@media (max-width: 960px)": {
    gridTemplateColumns: "1fr",
  },
}));

const ToolBar = styled("div")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(2),
}));

const CanvasColumns = styled("div")(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(2),
  minHeight: 0,
  "@media (max-width: 1200px)": {
    gridTemplateColumns: "1fr",
  },
}));

const Panel = styled("section")(() => ({
  display: "flex",
  flexDirection: "column",
}));

const SpriteIndexLabel = styled("div")(({ theme }) => ({
  padding: theme.spacing(1.5),
  backgroundColor: theme.palette.grey[900],
  color: theme.palette.common.white,
  borderRadius: theme.shape.borderRadius,
  fontSize: "0.95rem",
  fontWeight: 600,
}));

const ColorSelector = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: theme.spacing(1),
  padding: theme.spacing(0.5),
  backgroundColor: theme.palette.blue[800],
  borderRadius: theme.shape.borderRadius,
  width: "100%",
  height: "fit-content",
  alignContent: "start",
  overflowY: "auto",
  overflowX: "hidden",
  scrollbarWidth: "thin",
  scrollbarColor: `${theme.palette.grey[900]} ${theme.palette.grey[800]}`,
}));

const ColorButtonStyled = styled("button", {
  shouldForwardProp: (prop) => prop !== "$selected",
})<{ $selected: boolean }>(({ $selected, theme }) => ({
  aspectRatio: "1",
  width: theme.spacing(5),
  height: theme.spacing(5),
  border: `2px solid ${$selected ? theme.palette.common.white : theme.palette.grey[600]}`,
  borderRadius: "4px",
  cursor: "pointer",
  transition: "transform 0.1s ease",
  transform: $selected ? "scale(1.1)" : "none",
  "&:hover": {
    transform: "scale(1.1)",
  },
  "&:focus": { outline: "none" },
}));

const TileContainer = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: theme.spacing(1),
}));

const TileSizeButton = styled("button", {
  shouldForwardProp: (prop) => prop !== "$selected",
})<{ $selected: boolean }>(({ $selected, theme }) => ({
  border: `1px solid ${$selected ? theme.palette.common.white : theme.palette.grey[500]}`,
  backgroundColor: $selected ? theme.palette.common.white : theme.palette.grey[900],
  color: $selected ? theme.palette.grey[900] : theme.palette.common.white,
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(1.2, 1.5),
  fontSize: "0.9rem",
  fontWeight: 700,
  cursor: "pointer",
}));

const CanvasViewport = styled("div")(({ theme }) => ({
  position: "relative",
  borderRadius: theme.shape.borderRadius,
  overflow: "hidden",
  backgroundColor: theme.palette.grey[900],
  boxShadow: `inset 0 0 0 1px ${theme.palette.action.selected}`,
}));

const CanvasGridOverlay = styled("div", {
  shouldForwardProp: (prop) => !["$columns", "$rows", "$lineColor"].includes(String(prop)),
})<{ $columns: number; $rows: number; $lineColor: string }>(({ $columns, $rows, $lineColor }) => ({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  backgroundImage: `
    linear-gradient(to right, ${$lineColor} 1px, transparent 1px),
    linear-gradient(to bottom, ${$lineColor} 1px, transparent 1px)
  `,
  backgroundSize: `
    calc(100% / ${$columns}) 100%,
    100% calc(100% / ${$rows})
  `,
}));

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getCanvasPixelPos(
  e: React.MouseEvent<HTMLCanvasElement, MouseEvent>,
  rect: DOMRect,
  width: number,
  height: number
): Point2D {
  const normalizedX = clamp((e.clientX - rect.left) / rect.width, 0, 1);
  const normalizedY = clamp((e.clientY - rect.top) / rect.height, 0, 1);

  return {
    x: Math.floor(normalizedX * width),
    y: Math.floor(normalizedY * height),
  };
}

export const SpriteEditor: React.FC<EditorProps> = ({ project }) => {
  const [currentColor, setCurrentColor] = useState(0);
  const [tileSize, setTileSize] = useState<TileSize>(8);
  const [selectedTile, setSelectedTile] = useState<Point2D>({ x: 0, y: 0 });
  const [drawTool, setDrawTool] = useState<DrawTool>(DrawTool.Pen);
  const [isDrawing, setIsDrawing] = useState(false);
  const [version, setVersion] = useState(0);
  const [selectionCanvasVersion, setSelectionCanvasVersion] = useState(0);
  const [detailCanvasVersion, setDetailCanvasVersion] = useState(0);

  const onMouseDownRef = useRef<CanvasHandler>(undefined);
  const onMouseMoveRef = useRef<CanvasHandler>(undefined);
  const onMouseUpRef = useRef<CanvasHandler>(undefined);
  const selectionCanvasRef = useRef<SpriteRendererHandle | null>(null);
  const detailCanvasRef = useRef<SpriteRendererHandle | null>(null);

  const setSelectionCanvasHandle = useCallback((handle: SpriteRendererHandle | null) => {
    if (selectionCanvasRef.current === handle) return;
    selectionCanvasRef.current = handle;
    setSelectionCanvasVersion((value) => value + 1);
  }, []);

  const setDetailCanvasHandle = useCallback((handle: SpriteRendererHandle | null) => {
    if (detailCanvasRef.current === handle) return;
    detailCanvasRef.current = handle;
    setDetailCanvasVersion((value) => value + 1);
  }, []);

  const setOnMouseDown = useCallback((fn: CanvasHandler) => {
    onMouseDownRef.current = fn;
  }, []);
  const setOnMouseMove = useCallback((fn: CanvasHandler) => {
    onMouseMoveRef.current = fn;
  }, []);
  const setOnMouseUp = useCallback((fn: CanvasHandler) => {
    onMouseUpRef.current = fn;
  }, []);

  const sheetWidth = project.spriteProvider.size.width;
  const sheetHeight = project.spriteProvider.size.height;
  const baseSpriteWidth = project.spriteProvider.spriteSize.width;
  const baseSpriteHeight = project.spriteProvider.spriteSize.height;
  const selectionScreenSize = useMemo(() => ({
    width: sheetWidth,
    height: sheetHeight,
  }), [sheetHeight, sheetWidth]);
  const detailScreenSize = useMemo(() => ({
    width: tileSize,
    height: tileSize,
  }), [tileSize]);
  const spritesPerRow = sheetWidth / baseSpriteWidth;
  const tileSpriteSpanWidth = tileSize / baseSpriteWidth;
  const tileSpriteSpanHeight = tileSize / baseSpriteHeight;
  const tileColumns = sheetWidth / tileSize;
  const tileRows = sheetHeight / tileSize;
  const selectedTileIndex = (selectedTile.y / baseSpriteHeight) * spritesPerRow + (selectedTile.x / baseSpriteWidth);

  useEffect(() => {
    project.spriteProvider.observe(() => setVersion((value) => value + 1));
  }, [project]);

  useEffect(() => {
    setSelectedTile((prevTile) => ({
      x: clamp(Math.floor(prevTile.x / tileSize) * tileSize, 0, sheetWidth - tileSize),
      y: clamp(Math.floor(prevTile.y / tileSize) * tileSize, 0, sheetHeight - tileSize),
    }));
    setIsDrawing(false);
  }, [tileSize, sheetWidth, sheetHeight]);

  const tileSpriteAccessor = useMemo<SpritePixelAccessor>(() => {
    const minX = selectedTile.x;
    const minY = selectedTile.y;
    const maxX = minX + tileSize;
    const maxY = minY + tileSize;

    return {
      isPixelInBounds: (x: number, y: number) => x >= minX && x < maxX && y >= minY && y < maxY,
      getPixel: (x: number, y: number) => project.spriteProvider.getPixel(x, y),
      setPixel: (x: number, y: number, color: number) => {
        if (x < minX || x >= maxX || y < minY || y >= maxY) {
          return;
        }
        project.spriteProvider.setPixel(x, y, color);
      },
    };
  }, [project.spriteProvider, selectedTile.x, selectedTile.y, tileSize]);

  useEffect(() => {
    const handle = selectionCanvasRef.current;
    if (!handle) return;

    handle.clear(0);
    handle.queueSpriteDraw(0, 0, 0, spritesPerRow, sheetHeight / baseSpriteHeight);
    handle.drawOutlineRect(7, selectedTile.x, selectedTile.y, tileSize, tileSize);
    handle.draw();
  }, [baseSpriteHeight, selectedTile.x, selectedTile.y, selectionCanvasVersion, sheetHeight, spritesPerRow, tileSize, version]);

  useEffect(() => {
    const handle = detailCanvasRef.current;
    if (!handle) return;

    handle.clear(0);
    handle.queueSpriteDraw(selectedTileIndex, 0, 0, tileSpriteSpanWidth, tileSpriteSpanHeight);
    handle.draw();
  }, [detailCanvasVersion, selectedTileIndex, tileSpriteSpanHeight, tileSpriteSpanWidth, version]);

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
  };

  const handleTileSelect = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = getCanvasPixelPos(e, rect, sheetWidth, sheetHeight);

    setSelectedTile({
      x: clamp(Math.floor(x / tileSize) * tileSize, 0, sheetWidth - tileSize),
      y: clamp(Math.floor(y / tileSize) * tileSize, 0, sheetHeight - tileSize),
    });
  };

  const toSelectedTilePixel = useCallback((
    e: React.MouseEvent<HTMLCanvasElement, MouseEvent>
  ): Point2D => {
    const rect = e.currentTarget.getBoundingClientRect();
    const localPos = getCanvasPixelPos(e, rect, tileSize, tileSize);

    return {
      x: selectedTile.x + localPos.x,
      y: selectedTile.y + localPos.y,
    };
  }, [selectedTile.x, selectedTile.y, tileSize]);

  const handleEditorMouseDown = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0) return;

    setIsDrawing(true);
    onMouseDownRef.current?.(e, toSelectedTilePixel(e));
    setVersion((value) => value + 1);
  };

  const handleEditorMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!isDrawing) return;

    onMouseMoveRef.current?.(e, toSelectedTilePixel(e));
    setVersion((value) => value + 1);
  };

  const handleEditorMouseUp = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0) return;

    onMouseUpRef.current?.(e, toSelectedTilePixel(e));
    setIsDrawing(false);
    setVersion((value) => value + 1);
  };

  return (
    <EditorLayout
      onContextMenu={handleContextMenu}
      data-cy="sprite-editor"
    >
      <ToolBar>
        <Panel>
          <ColorPalette
            colors={colorPalette}
            currentColor={currentColor}
            onColorSelect={setCurrentColor}
          />
        </Panel>

        <Panel>
          <Tools
            color={currentColor}
            setOnMouseDown={setOnMouseDown}
            setOnMouseMove={setOnMouseMove}
            setOnMouseUp={setOnMouseUp}
            drawTool={drawTool}
            onSelectTool={setDrawTool}
            spriteProvider={tileSpriteAccessor}
          />
        </Panel>

        <Panel>
          <TileContainer>
            {TILE_SIZES.map((size) => (
              <TileSizeButton
                key={size}
                type="button"
                $selected={tileSize === size}
                onClick={() => setTileSize(size)}
              >
                {size}x{size}
              </TileSizeButton>
            ))}
          </TileContainer>
        </Panel>

        <Panel>
          <SpriteIndexLabel>
            Sprite index: {selectedTileIndex}
          </SpriteIndexLabel>
        </Panel>

        <Panel>
          <CanvasViewport>
            <StyledCanvas
              ref={setSelectionCanvasHandle}
              sprite={project.spriteProvider}
              map={project.mapProvider}
              sound={project.sound}
              screenSize={selectionScreenSize}
              onClick={handleTileSelect}
              style={{
                width: "100%",
                height: "100%",
              }}
            />
            <CanvasGridOverlay
              $columns={tileColumns}
              $rows={tileRows}
              $lineColor="rgba(255, 255, 255, 0.20)"
            />
          </CanvasViewport>
        </Panel>
      </ToolBar>

      <CanvasColumns>
        <Panel>
          <CanvasViewport>
            <StyledCanvas
              ref={setDetailCanvasHandle}
              sprite={project.spriteProvider}
              map={project.mapProvider}
              screenSize={detailScreenSize}
              sound={project.sound}
              onMouseDown={handleEditorMouseDown}
              onMouseMove={handleEditorMouseMove}
              onMouseUp={handleEditorMouseUp}
              onMouseLeave={() => setIsDrawing(false)}
              style={{
                width: "100%",
                height: "100%"
              }}
            />
            <CanvasGridOverlay
              $columns={tileSize}
              $rows={tileSize}
              $lineColor="rgba(255, 255, 255, 0.20)"
            />
          </CanvasViewport>
        </Panel>
      </CanvasColumns>
    </EditorLayout>
  );
};

export const spriteEditorTabData = {
  title: "Sprite",
  icon: "sprite",
};
