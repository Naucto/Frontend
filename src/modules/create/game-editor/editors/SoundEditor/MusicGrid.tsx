import React, { useRef, useEffect } from "react";
import { ProgressBar } from "./components/ProgressBar";
import { MusicGridProps, GridCellData } from "./types/MusicGrid.types";
import {
  ScrollableContainer,
  GridWithProgressContainer,
  GridContainer,
  GridCell,
} from "./styles/MusicGrid.styles";

export type { GridCellData, MusicGridProps };

const CELL_WIDTH = 35;

export const MusicGrid: React.FC<MusicGridProps> = ({
  gridCells,
  onMouseDown,
  onMouseOver,
  onMouseUp,
  playbackPosition,
  totalLength,
  maxLength,
  onSeek,
  isPlaying,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current || !isPlaying) return;
    const columnCenter = playbackPosition * CELL_WIDTH + CELL_WIDTH / 2;
    const targetScroll = columnCenter - scrollRef.current.clientWidth / 2;
    scrollRef.current.scrollLeft = Math.max(0, targetScroll);
  }, [playbackPosition, isPlaying]);

  return (
    <ScrollableContainer ref={scrollRef}>
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
};

