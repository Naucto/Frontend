import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { colorPalette } from "./Color";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import React from "react";
import { StyledCanvas } from "@shared/canvas/Canvas";
import CanvasGridOverlay from "@shared/canvas/CanvasGridOverlay";
import { EditorProps } from "../../create/game-editor/editors/EditorType";
import { styled } from "@mui/material";
import Tools, { SpritePixelAccessor } from "@modules/editor/SpriteEditor/Tools";
import { SelectedSpriteFrame } from "@shared/canvas/SelectedSpriteFrame";

export enum DrawTool {
  Pen,
  Fill,
  Line, // TODO
  Rectangle, // TODO
}
export type CanvasHandler = ((pixelPos: Point2D) => void) | undefined;

const TILE_SIZES = Array.from({ length: 8 }, (_, i) => (i + 1) * 8);
const BIT_INDICES = [0,1,2,3,4,5,6,7] as const;
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

const HPanel = styled("section")(() => ({
  display: "flex",
  flexDirection: "row",
  gap: 16,
}));

const SpriteMetaPanel = styled("div")(({ theme }) => ({
  display: "grid",
  gap: theme.spacing(1.25),
  padding: theme.spacing(1.5),
  backgroundColor: theme.palette.grey[900],
  color: theme.palette.common.white,
  borderRadius: theme.shape.borderRadius,
}));

const SpriteMetaRow = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: theme.spacing(1),
}));

const SpriteMetaTitle = styled("span")(() => ({
  fontWeight: 700,
}));

const SpriteMetaValue = styled("span")(({ theme }) => ({
  color: theme.palette.yellow[300],
}));

const FlagInput = styled("input")(({ theme }) => ({
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.grey[800],
  color: theme.palette.common.white,
  padding: theme.spacing(1),
  border: "none"
}));

const BitGrid = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: theme.spacing(1.0),
}));

const BitButton = styled("button", {
  shouldForwardProp: (prop) => prop !== "$active",
})<{ $active: boolean }>(({ $active, theme }) => ({
  border: "none",
  borderRadius: theme.shape.borderRadius,
  backgroundColor: $active ? theme.palette.blue[500] : theme.palette.grey[800],
  color: theme.palette.common.white,
  padding: theme.spacing(1),
}));

const ColorSelector = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(3, 0fr)",
  gap: theme.spacing(1),
  padding: theme.spacing(0.5),
  backgroundColor: theme.palette.blue[800],
  borderRadius: theme.shape.borderRadius,
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

const CanvasViewport = styled("div")(({ theme }) => ({
  backgroundColor: theme.palette.grey[900],
  position: "relative",
  borderRadius: theme.shape.borderRadius,
  overflow: "hidden",
}));

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatByte(value: number): string {
  return value.toString(2).padStart(8, "0");
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
  const [, setFlagVersion] = useState(0);

  const isDrawingRef = useRef(false);
  const onMouseDownRef = useRef<CanvasHandler>(undefined);
  const onMouseMoveRef = useRef<CanvasHandler>(undefined);
  const onMouseUpRef = useRef<CanvasHandler>(undefined);
  const selectionCanvasRef = useRef<SpriteRendererHandle | null>(null);
  const detailCanvasRef = useRef<SpriteRendererHandle | null>(null);

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
  const spritesPerCol = project.spriteProvider.size.height / project.spriteProvider.spriteSize.height;

  const tileSpriteSpanWidth = tileSize / baseSpriteWidth;
  const tileSpriteSpanHeight = tileSize / baseSpriteHeight;

  const selectedTileIndex = (selectedTile.y / baseSpriteHeight) * spritesPerRow + (selectedTile.x / baseSpriteWidth);
  const selectedSpriteX = selectedTileIndex % spritesPerRow;
  const selectedSpriteY = Math.floor(selectedTileIndex / spritesPerRow);

  const selectedSpriteFlag = project.spriteProvider.getFlag(selectedTileIndex);
  const selectedSpriteFlagBits = formatByte(selectedSpriteFlag);

  const drawSelectionCanvas = useCallback((): void => {
    const handle = selectionCanvasRef.current;
    if (!handle) return;

    handle.queueSpriteDraw(0, 0, 0, spritesPerRow, sheetHeight / baseSpriteHeight);
    handle.draw();
  }, [baseSpriteHeight, sheetHeight, spritesPerRow]);

  const drawDetailCanvas = useCallback((): void => {
    const handle = detailCanvasRef.current;
    if (!handle) return;

    handle.queueSpriteDraw(selectedTileIndex, 0, 0, tileSpriteSpanWidth, tileSpriteSpanHeight);
    handle.draw();
  }, [selectedTileIndex, tileSpriteSpanHeight, tileSpriteSpanWidth]);

  const redraw = useCallback((): void => {
    drawDetailCanvas();
    drawSelectionCanvas();
  }, [drawDetailCanvas, drawSelectionCanvas]);

  const setSelectionCanvasHandle = useCallback((handle: SpriteRendererHandle | null) => {
    selectionCanvasRef.current = handle;
    if (handle) {
      redraw();
    }
  }, [redraw]);

  const setDetailCanvasHandle = useCallback((handle: SpriteRendererHandle | null) => {
    detailCanvasRef.current = handle;
    if (handle) {
      redraw();
    }
  }, [redraw]);

  useEffect(() => {
    project.spriteProvider.observe(redraw);
    project.spriteProvider.observeFlags(() => setFlagVersion((value) => value + 1));
  }, [project, redraw]);

  useEffect(() => {
    setSelectedTile((prevTile) => ({
      x: clamp(Math.floor(prevTile.x / baseSpriteWidth) * baseSpriteWidth, 0, sheetWidth - baseSpriteWidth),
      y: clamp(Math.floor(prevTile.y / baseSpriteHeight) * baseSpriteHeight, 0, sheetHeight - baseSpriteHeight),
    }));
    isDrawingRef.current = false;
  }, [baseSpriteHeight, baseSpriteWidth, sheetHeight, sheetWidth, tileSize]);

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
    redraw();
  }, [redraw, selectedTile, tileSize]);

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
  };

  const handleTileSelect = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = getCanvasPixelPos(e, rect, sheetWidth, sheetHeight);

    setSelectedTile({
      x: clamp(Math.floor(x / baseSpriteWidth) * baseSpriteWidth, 0, sheetWidth - baseSpriteWidth),
      y: clamp(Math.floor(y / baseSpriteHeight) * baseSpriteHeight, 0, sheetHeight - baseSpriteHeight),
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

    isDrawingRef.current = true;
    onMouseDownRef.current?.(toSelectedTilePixel(e));
    redraw();
  };

  const handleEditorMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!isDrawingRef.current) return;

    onMouseMoveRef.current?.(toSelectedTilePixel(e));
    redraw();
  };

  const handleEditorMouseUp = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0) return;

    if (isDrawingRef.current) {
      onMouseUpRef.current?.(toSelectedTilePixel(e));
      redraw();
    }
    isDrawingRef.current = false;
  };

  const handleEditorMouseLeave = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!isDrawingRef.current) return;

    onMouseUpRef.current?.(toSelectedTilePixel(e));
    isDrawingRef.current = false;
    redraw();
  };

  const handleFlagChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const rawValue = Number(e.target.value);
    const nextValue = Number.isNaN(rawValue) ? 0 : clamp(Math.trunc(rawValue), 0, 255);

    project.spriteProvider.setFlag(selectedTileIndex, nextValue);
  };

  const handleBitToggle = (bit: number): void => {
    project.spriteProvider.setFlagBit(selectedTileIndex, bit, !project.spriteProvider.getFlagBit(selectedTileIndex, bit));
  };

  const handleTileSizeWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    e.preventDefault();

    const currentIndex = TILE_SIZES.indexOf(tileSize);
    if (currentIndex === -1) {
      return;
    }

    const direction = e.deltaY > 0 ? 1 : -1;
    const nextIndex = clamp(currentIndex + direction, 0, TILE_SIZES.length - 1);
    setTileSize(TILE_SIZES[nextIndex]);
  };

  return (
    <EditorLayout
      onContextMenu={handleContextMenu}
      data-cy="sprite-editor"
    >
      <ToolBar>
        <HPanel>
          <ColorPalette
            colors={colorPalette}
            currentColor={currentColor}
            onColorSelect={setCurrentColor}
          />
          <Tools
            color={currentColor}
            setOnMouseDown={setOnMouseDown}
            setOnMouseMove={setOnMouseMove}
            setOnMouseUp={setOnMouseUp}
            drawTool={drawTool}
            onSelectTool={setDrawTool}
            spriteProvider={tileSpriteAccessor}
          />
        </HPanel>

        <Panel>
          <SpriteMetaPanel>
            <SpriteMetaRow>
              <SpriteMetaTitle>Sprite index</SpriteMetaTitle>
              <SpriteMetaValue>{selectedTileIndex}</SpriteMetaValue>
            </SpriteMetaRow>

            <SpriteMetaRow>
              <SpriteMetaTitle>Flag value</SpriteMetaTitle>
              <SpriteMetaValue>0b{selectedSpriteFlagBits}</SpriteMetaValue>
            </SpriteMetaRow>

            <FlagInput
              type="number"
              min={0}
              max={255}
              value={selectedSpriteFlag}
              onChange={handleFlagChange}
              aria-label={`Flag value for sprite ${selectedTileIndex}`}
            />

            <BitGrid>
              {BIT_INDICES.map((bit) => (
                <BitButton
                  key={bit}
                  type="button"
                  $active={project.spriteProvider.getFlagBit(selectedTileIndex, bit)}
                  onClick={() => handleBitToggle(bit)}
                >
                  {bit}
                </BitButton>
              ))}
            </BitGrid>
          </SpriteMetaPanel>
        </Panel>

        <Panel>
          <CanvasViewport onWheel={handleTileSizeWheel}>
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
              columns={sheetWidth / baseSpriteWidth}
              rows={sheetHeight / baseSpriteHeight}
              lineColor="rgba(255, 255, 255, 0.20)"
            />
            <SelectedSpriteFrame
              $left={`${(selectedSpriteX / spritesPerRow) * 100}%`}
              $top={`${(selectedSpriteY / spritesPerCol) * 100}%`}
              $width={`${(100 / spritesPerRow)*tileSize/8}%`}
              $height={`${(100 / spritesPerCol)*tileSize/8}%`}
            />
          </CanvasViewport>
        </Panel>
      </ToolBar>

      <CanvasColumns>
        <Panel>
          <CanvasViewport onWheel={handleTileSizeWheel}>
            <StyledCanvas
              ref={setDetailCanvasHandle}
              sprite={project.spriteProvider}
              map={project.mapProvider}
              screenSize={detailScreenSize}
              sound={project.sound}
              onMouseDown={handleEditorMouseDown}
              onMouseMove={handleEditorMouseMove}
              onMouseUp={handleEditorMouseUp}
              onMouseLeave={handleEditorMouseLeave}
              style={{
                width: "100%",
                height: "100%"
              }}
            />
            <CanvasGridOverlay
              columns={tileSize}
              rows={tileSize}
              lineColor="rgba(255, 255, 255, 0.20)"
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
