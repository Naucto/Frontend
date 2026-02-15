import React from "react";
import { styled } from "@mui/material/styles";

export interface GridCellData {
  cellKey: string;
  isActive: boolean;
  row: number;
  col: number;
  note: string;
  isNoteStart: boolean;
  isPlayingColumn: boolean;
}

const ScrollableContainer = styled("div")(() => ({
  maxWidth: "45%",
  maxHeight: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  display: "flex",
  flexDirection: "column",
  flexWrap: "nowrap",
}));

const GridWithProgressContainer = styled("div")(() => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
}));

const GridContainer = styled("div")(() => ({
  width: "max-content",
  display: "grid",
  gridTemplateColumns: "repeat(32, 35px)",
  gridTemplateRows: "repeat(24, 20px)",
  marginTop: "1em",
  rowGap: "2px",
  backgroundColor: "#537D8D",
  boxSizing: "border-box",
  border: "3px solid #537D8D",
}));

const GridCell = styled("div")<{ isActive?: boolean; isPlayingColumn?: boolean }>(({ isActive, isPlayingColumn }) => ({
  width: "35px",
  height: "20px",
  boxSizing: "border-box",
  backgroundColor: isPlayingColumn
    ? "rgba(0, 188, 212, 0.4)"
    : isActive
      ? "#2a3c45"
      : "#3a5863",
  color: isActive ? "black" : "transparent",
  userSelect: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: isActive ? "12px" : "10px",
  fontWeight: isActive ? "bold" : "normal",
  borderLeft: isPlayingColumn ? "3px solid #00BCD4" : "none",
  borderRight: isPlayingColumn ? "3px solid #00BCD4" : "none",
  boxShadow: isPlayingColumn ? "0 0 8px rgba(0, 188, 212, 0.8)" : "none",
  transition: isPlayingColumn ? "background-color 0.1s ease, box-shadow 0.1s ease" : "none",
  "&:hover": {
    backgroundColor: isPlayingColumn
      ? "rgba(0, 188, 212, 0.5)"
      : "#2a3c45",
  },
}));

const ProgressBarContainer = styled("div")(() => ({
  width: "1120px",
  height: "30px",
  marginTop: "10px",
  marginBottom: "10px",
  position: "relative",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  marginLeft: "3px",
}));

const ProgressBarTrack = styled("div")(() => ({
  width: "100%",
  height: "8px",
  backgroundColor: "#3a5863",
  borderRadius: "4px",
  position: "relative",
  overflow: "hidden",
}));

const ProgressBarFill = styled("div")<{ width: string }>(({ width }) => ({
  height: "100%",
  width: width,
  backgroundColor: "#00BCD4",
  borderRadius: "4px",
  transition: "width 0.1s linear",
}));

const ProgressBarThumb = styled("div")<{ left: string }>(({ left }) => ({
  position: "absolute",
  top: "50%",
  left: left,
  transform: "translate(-50%, -50%)",
  width: "16px",
  height: "16px",
  backgroundColor: "#4c7280",
  borderRadius: "50%",
  cursor: "pointer",
  border: "2px solid #7597a4",
  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.3)",
  "&:hover": {
    backgroundColor: "#3b5964",
    transform: "translate(-50%, -50%) scale(1.2)",
  },
}));

interface ProgressBarProps {
  progress: number;
  onSeek: (position: number) => void;
  totalLength: number;
  maxLength: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  onSeek,
  totalLength,
  maxLength,
}) => {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const columnWidth = rect.width / totalLength;
    const column = Math.floor(x / columnWidth);
    const position = Math.max(0, Math.min(maxLength - 1, column));
    onSeek(position);
  };

  const cappedProgress = Math.min(progress, maxLength - 1);
  const columnCenterPosition = totalLength > 0 ? ((cappedProgress + 0.5) / totalLength) * 100 : 0;
  const fillPercentage = totalLength > 0 && maxLength > 0 ? ((cappedProgress + 1) / maxLength) * (maxLength / totalLength) * 100 : 0;

  return (
    <ProgressBarContainer onClick={handleClick}>
      <ProgressBarTrack>
        <ProgressBarFill width={`${fillPercentage}%`} />
        <ProgressBarThumb left={`${columnCenterPosition}%`} />
      </ProgressBarTrack>
    </ProgressBarContainer>
  );
};

export interface MusicGridProps {
  gridCells: GridCellData[];
  onMouseDown: (row: number, col: number) => void;
  onMouseOver: (row: number, col: number) => void;
  onMouseUp: (row: number, col: number) => void;
  playbackPosition: number;
  totalLength: number;
  maxLength: number;
  onSeek: (position: number) => void;
}

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

