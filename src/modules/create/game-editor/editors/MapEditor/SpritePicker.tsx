import React, { useCallback, useEffect } from "react";
import { styled } from "@mui/material/styles";
import { StyledCanvas } from "@shared/canvas/Canvas";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { ProjectProvider } from "@providers/ProjectProvider";

const PickerContainer = styled("div")(({ theme }) => ({
  display: "flex",
  padding: theme.spacing(1),
  width: "100%",
}));

export type SpritePickerProps = {
  selectedIndex: number;
  onSelect: (index: number) => void;
  project: ProjectProvider;
};

export const SpritePicker: React.FC<SpritePickerProps> = ({ onSelect, project }) => {
  const canvasRef = React.createRef<SpriteRendererHandle>();
  const [, setVersion] = React.useState(0);

  if (!project) return null;

  const spritesPerRow = project.sprite.size.width / project.sprite.spriteSize.width;
  const spritesPerCol = project.sprite.size.height / project.sprite.spriteSize.height;

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

    const px = Math.floor(nx * project.sprite.size.width);
    const py = Math.floor(ny * project.sprite.size.height);

    const sx = Math.floor(px / project.sprite.spriteSize.width);
    const sy = Math.floor(py / project.sprite.spriteSize.height);

    if (sx < 0 || sy < 0 || sx >= spritesPerRow || sy >= spritesPerCol) return;
    const index = sy * spritesPerRow + sx;
    onSelect(index);
  }, [onSelect, project, spritesPerRow, spritesPerCol]);

  useEffect(() => {
    project.sprite.observe(() => {
      setVersion(v => v + 1);
    });
  }, [project]);

  return (
    <PickerContainer onContextMenu={(e) => e.preventDefault()}>
      <StyledCanvas
        ref={canvasRef}
        sprite={project.sprite}
        map={project.map}
        screenSize={{
          width: project.sprite.size.width,
          height: project.sprite.size.height,
        }}
        onClick={handleClick}
      />
    </PickerContainer>
  );
};

export default SpritePicker;
