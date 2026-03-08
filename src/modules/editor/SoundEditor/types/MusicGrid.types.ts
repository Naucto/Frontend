export interface GridCellData {
  cellKey: string;
  isActive: boolean;
  row: number;
  col: number;
  note: string;
  isNoteStart: boolean;
  isPlayingColumn: boolean;
}

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

