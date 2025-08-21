import React, { useCallback, useEffect } from "react";
import { styled } from "@mui/material/styles";
import { StyledCanvas } from "@shared/canvas/Canvas";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { useProject } from "src/providers/ProjectProvider";

const PickerContainer = styled("div")(({ theme }) => ({
  display: "flex",
  padding: theme.spacing(1),
  width: "100%",
}));

export type SpritePickerProps = {
  selectedIndex: number;
  onSelect: (index: number) => void;
};

export const SpritePicker: React.FC<SpritePickerProps> = ({ onSelect }) => {
  const { project } = useProject();
  const canvasRef = React.createRef<SpriteRendererHandle>();

  if (!project) return null;

  const spritesPerRow = project.spriteSheet.size.width / project.spriteSheet.spriteSize.width;
  const spritesPerCol = project.spriteSheet.size.height / project.spriteSheet.spriteSize.height;

  useEffect(() => {
    const handle = canvasRef.current;
    if (!handle) return;

    handle.queueSpriteDraw(0, 0, 0, spritesPerRow, spritesPerCol);
    handle.draw();
  }, [canvasRef, spritesPerRow, spritesPerCol]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    const px = Math.floor(nx * project.spriteSheet.size.width);
    const py = Math.floor(ny * project.spriteSheet.size.height);

    const sx = Math.floor(px / project.spriteSheet.spriteSize.width);
    const sy = Math.floor(py / project.spriteSheet.spriteSize.height);

    if (sx < 0 || sy < 0 || sx >= spritesPerRow || sy >= spritesPerCol) return;
    const index = sy * spritesPerRow + sx;
    onSelect(index);
  }, [onSelect, project, spritesPerRow, spritesPerCol]);

  return (
    <PickerContainer onContextMenu={(e) => e.preventDefault()}>
      <StyledCanvas
        ref={canvasRef}
        spriteSheet={project.spriteSheet}
        palette={project.palette}
        map={project.map}
        screenSize={{
          width: project.spriteSheet.size.width,
          height: project.spriteSheet.size.height,
        }}
        onClick={handleClick}
      />
    </PickerContainer>
  );
};

export default SpritePicker;
