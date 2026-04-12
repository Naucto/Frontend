import React from "react";
import { ProgressBar } from "./components/ProgressBar";
import { MusicGridProps, GridCellData } from "./types/MusicGrid.types";
import {
  ScrollableContainer,
  GridWithProgressContainer,
  GridContainer,
  GridCell,
} from "./styles/MusicGrid.styles";

export type { GridCellData, MusicGridProps };

export const MusicGrid: React.FC<MusicGridProps> = ({
  gridCells,
  onMouseDown,
  onMouseOver,
  onMouseUp,
  playbackPosition,
  totalLength,
  maxLength,
  onSeek,
}) => (
  <ScrollableContainer>
    <GridWithProgressContainer>
      <ProgressBar
        progress={playbackPosition}
        onSeek={onSeek}
        totalLength={totalLength}
        maxLength={maxLength}
      />
      <GridContainer>
        {gridCells.map((cell) => (
          <GridCell
            key={cell.cellKey}
            isActive={cell.isActive}
            isPlayingColumn={cell.isPlayingColumn}
            onMouseDown={() => onMouseDown(cell.row, cell.col)}
            onMouseOver={() => onMouseOver(cell.row, cell.col)}
            onMouseUp={() => onMouseUp(cell.row, cell.col)}
          >
            {cell.isNoteStart ? cell.note : ""}
          </GridCell>
        ))}
      </GridContainer>
    </GridWithProgressContainer>
  </ScrollableContainer>
);

