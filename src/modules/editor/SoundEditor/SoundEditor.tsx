import React, { useState, useCallback, useEffect, useMemo } from "react";
import { styled } from "@mui/material/styles";
import { Box } from "@mui/material";
import { Doc } from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { createMusic, MusicData, setNote, playMusicFromPosition } from "./Music";
import { registerCustomInstrument } from "./Note";
import { InstrumentEditor, InstrumentConfig } from "./InstrumentEditor";
import "./SoundEditor.css";

const ButtonContainer = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
  gap: theme.spacing(1),
  marginTop: theme.spacing(2.5),
  width: "100%",
  maxWidth: "250px",
}));

const MusicSelectionContainer = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: theme.spacing(0.5),
  marginTop: theme.spacing(2.5),
  width: "100%",
  maxWidth: "150px",
}));

const MusicEditorButton = styled("button")(({ theme }) => ({
  backgroundColor: theme.palette.blue[500],
  color: theme.palette.text.primary,
  padding: `${theme.spacing(1)} ${theme.spacing(2)}`,
  cursor: "pointer",
  fontSize: `${theme.typography.fontSize}px`,
  textAlign: "center",
  textDecoration: "none",
  display: "inline-block",
  boxShadow: "none",
  margin: `${theme.spacing(0.5)} ${theme.spacing(0.25)}`,
  fontFamily: theme.typography.fontFamily,
  borderRadius: theme.spacing(1.2),
  border: `${theme.spacing(0.25)} solid ${theme.palette.blue[600]}`,
  minWidth: "auto",
  "&:hover": {
    backgroundColor: theme.palette.blue[700],
  },
  "&.selected": {
    backgroundColor: theme.palette.blue[600],
  },
}));

const GridContainer = styled("div")({
  width: "max-content",
  display: "grid",
  gridTemplateColumns: "repeat(32, 35px)",
  gridTemplateRows: "repeat(24, 20px)",
  marginTop: "1em",
  rowGap: "2px",
  backgroundColor: "#537D8D",
  boxSizing: "border-box",
  border: "3px solid #537D8D",
});

const GridCell = styled("div")<{ isActive: boolean; isPlayingColumn: boolean }>(({ isActive, isPlayingColumn }) => ({
  width: "35px",
  height: "20px",
  boxSizing: "border-box",
  backgroundColor: isPlayingColumn ? "rgba(0, 188, 212, 0.4)" : (isActive ? "#2a3c45" : "#3a5863"),
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
    backgroundColor: isPlayingColumn ? "rgba(0, 188, 212, 0.5)" : "#2a3c45",
  },
}));

const ScrollableContainer = styled("div")({
  maxWidth: "45%",
  maxHeight: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  display: "flex",
  flexDirection: "column",
  flexWrap: "nowrap",
});

const GridWithProgressContainer = styled("div")({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
});

const EditorContainer = styled("div")({
  display: "flex",
  gap: "20px",
  alignItems: "flex-start",
  width: "100%",
  maxWidth: "100%",
  overflow: "hidden",
});

const ControlButtonsContainer = styled("div")({
  display: "flex",
  justifyContent: "space-around",
  marginTop: "20px",
});

const ProgressBarContainer = styled("div")(({ theme }) => ({
  width: "1120px", // Exact grid width: 32 columns * 35px
  height: "30px",
  marginTop: "10px",
  marginBottom: "10px",
  position: "relative",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  marginLeft: "3px", // Align with grid border (grid has 3px left border)
}));

const ProgressBarTrack = styled("div")(({ theme }) => ({
  width: "100%",
  height: "8px",
  backgroundColor: "#3a5863",
  borderRadius: "4px",
  position: "relative",
  overflow: "hidden",
}));

const ProgressBarFill = styled("div")<{ progress: number }>(({ progress, theme }) => ({
  width: `${progress}%`,
  height: "100%",
  backgroundColor: "#00BCD4", // Bright cyan for better contrast against blue-gray background
  borderRadius: "4px",
  transition: "width 0.1s linear",
}));

const ProgressBarThumb = styled("div")<{ position: number }>(({ position, theme }) => ({
  position: "absolute",
  left: `${position}%`,
  top: "50%",
  transform: "translate(-50%, -50%)",
  width: "16px",
  height: "16px",
  backgroundColor: theme.palette.blue[600],
  borderRadius: "50%",
  cursor: "pointer",
  border: `2px solid ${theme.palette.blue[400]}`,
  boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
  "&:hover": {
    backgroundColor: theme.palette.blue[700],
    transform: "translate(-50%, -50%) scale(1.2)",
  },
}));

const ErrorMessage = styled("div")({
  color: "red",
  textAlign: "center",
  marginTop: "10px",
});

const defaultInstruments: Map<string, string> = new Map([
  ["piano", "Piano"],
  ["guitar", "Guitar"],
  ["flute", "Flute"],
  ["trumpet", "Trumpet"],
  ["contrabass", "Contrabass"],
  ["harmonica", "Harmonica"],
]);

const CUSTOM_INSTRUMENTS_STORAGE_KEY = "soundEditor_customInstruments";

interface SoundEditorProps {
  ydoc?: Doc;
  provider?: WebrtcProvider;
}

interface GridCellData {
  cellKey: string;
  isActive: boolean;
  row: number;
  col: number;
  note: string;
  isNoteStart: boolean;
  isPlayingColumn: boolean;
}

interface InstrumentButtonsProps {
  instruments: Map<string, string>;
  currentInstrument: string;
  onInstrumentSelect: (instrument: string) => void;
  customInstruments: Set<string>;
  onEdit?: (instrument: string) => void;
  onDelete?: (instrument: string) => void;
}

const InstrumentButtons: React.FC<InstrumentButtonsProps> = ({
  instruments,
  currentInstrument,
  onInstrumentSelect,
  customInstruments,
  onEdit,
  onDelete,
}) => {
  const isCustomInstrument = customInstruments.has(currentInstrument);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <ButtonContainer>
        {Array.from(instruments.keys()).map((instrument) => (
          <MusicEditorButton
            className={currentInstrument === instrument ? "selected" : ""}
            key={instrument}
            onClick={() => onInstrumentSelect(instrument)}
            style={{ width: "100%" }}
          >
            {instruments.get(instrument)}
          </MusicEditorButton>
        ))}
      </ButtonContainer>
      {isCustomInstrument && onEdit && onDelete && (
        <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
          <MusicEditorButton
            onClick={() => onEdit(currentInstrument)}
            style={{ backgroundColor: "#4caf50", borderColor: "#45a049" }}
          >
            Edit
          </MusicEditorButton>
          <MusicEditorButton
            onClick={() => onDelete(currentInstrument)}
            style={{ backgroundColor: "#f44336", borderColor: "#da190b" }}
          >
            Delete
          </MusicEditorButton>
        </Box>
      )}
    </Box>
  );
};

interface MusicSelectionButtonsProps {
  musics: MusicData[];
  selectedMusicIndex: number;
  onMusicSelect: (index: number) => void;
}

const MusicSelectionButtons: React.FC<MusicSelectionButtonsProps> = ({
  musics,
  selectedMusicIndex,
  onMusicSelect,
}) => (
  <MusicSelectionContainer>
    {musics.map((_, index) => (
      <MusicEditorButton
        className={`music-selection-button ${selectedMusicIndex === index ? "selected" : ""}`}
        key={index}
        onClick={() => onMusicSelect(index)}
        style={{
          padding: "4px 8px",
          fontSize: "12px",
          minWidth: "auto",
          width: "100%"
        }}
      >
        {index + 1}
      </MusicEditorButton>
    ))}
  </MusicSelectionContainer>
);

interface MusicGridProps {
  gridCells: GridCellData[];
  onMouseDown: (row: number, col: number) => void;
  onMouseOver: (row: number, col: number) => void;
  onMouseUp: (row: number, col: number) => void;
  playbackPosition: number;
  totalLength: number;
  maxLength: number;
  onSeek: (position: number) => void;
}

const MusicGrid: React.FC<MusicGridProps> = ({
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

interface ControlButtonsProps {
  isPlaying: boolean;
  onPlay: () => void;
  onClear: () => void;
}

const ControlButtons: React.FC<ControlButtonsProps> = ({
  isPlaying,
  onPlay,
  onClear,
}) => (
  <ControlButtonsContainer>
    <MusicEditorButton onClick={onPlay} disabled={isPlaying}>
      {isPlaying ? "Playing..." : "Play"}
    </MusicEditorButton>
    <MusicEditorButton onClick={onClear}>Clear</MusicEditorButton>
  </ControlButtonsContainer>
);

interface ProgressBarProps {
  progress: number; // Current column index
  onSeek: (position: number) => void;
  totalLength: number; // Total columns in music (32)
  maxLength: number; // Last column with notes
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  onSeek,
  totalLength,
  maxLength,
}) => {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const columnWidth = rect.width / totalLength;
    const column = Math.floor(x / columnWidth);
    const position = Math.max(0, Math.min(maxLength - 1, column));
    onSeek(position);
  };

  // Calculate position to align with column centers
  // Each column is 35px wide, so center is at (column + 0.5) * (100 / totalLength)%
  // Cap progress at maxLength (last column with notes)
  const cappedProgress = Math.min(progress, maxLength - 1);
  const columnCenterPosition = totalLength > 0 ? ((cappedProgress + 0.5) / totalLength) * 100 : 0;
  // Fill percentage: (progress / maxLength) * (maxLength / totalLength) * 100
  // This makes the fill stop at maxLength but fill only the portion of the bar that represents notes
  const fillPercentage = totalLength > 0 && maxLength > 0 ? ((cappedProgress + 1) / maxLength) * (maxLength / totalLength) * 100 : 0;

  return (
    <ProgressBarContainer onClick={handleClick}>
      <ProgressBarTrack>
        <ProgressBarFill progress={fillPercentage} />
        <ProgressBarThumb position={columnCenterPosition} />
      </ProgressBarTrack>
    </ProgressBarContainer>
  );
};

export const SoundEditor: React.FC<SoundEditorProps> = ({ ydoc, provider }) => {
  const [currentMusic, setCurrentMusic] = useState<MusicData>(createMusic());
  const [currentInstrument, setCurrentInstrument] = useState<string>("piano");
  const [activeCells, setActiveCells] = useState<Set<string>>(new Set());
  const [selectedMusicIndex, setSelectedMusicIndex] = useState<number>(0);
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);
  const [startPosition, setStartPosition] = useState<[number, number]>([-1, -1]);
  const [musics, setMusics] = useState<MusicData[]>(() => Array(16).fill(null).map(() => createMusic()));
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState<number>(0);
  const [playbackStartPosition, setPlaybackStartPosition] = useState<number>(0);
  const [customInstruments, setCustomInstruments] = useState<Map<string, InstrumentConfig>>(new Map());
  const [instruments, setInstruments] = useState<Map<string, string>>(new Map(defaultInstruments));
  const [isInstrumentEditorOpen, setIsInstrumentEditorOpen] = useState<boolean>(false);
  const [editingInstrument, setEditingInstrument] = useState<{ name: string; config: InstrumentConfig; originalKey?: string } | undefined>(undefined);

  // Find the last column that has notes
  const getLastColumnWithNotes = useMemo(() => {
    let lastColumn = -1;
    for (let i = currentMusic.notes.length - 1; i >= 0; i--) {
      if (currentMusic.notes[i] && currentMusic.notes[i].length > 0) {
        // Check if this column has any non-empty notes
        const hasNotes = currentMusic.notes[i].some(note => note && note.note !== "Nan");
        if (hasNotes) {
          lastColumn = i;
          break;
        }
      }
    }
    // If no notes found, return at least 0 or the music length
    return lastColumn >= 0 ? lastColumn + 1 : currentMusic.length;
  }, [currentMusic]);

  const gridCells = useMemo(() => {
    return [...Array(24)].map((_, row) =>
      [...Array(32)].map((_, col) => {
        const cellKey = `${row}-${col}`;
        const isActive = activeCells.has(cellKey);
        // Highlight the column that is currently playing
        // playbackPosition now directly represents the column index (0-based) that's currently playing
        const isPlayingColumn = isPlaying && playbackPosition >= 0 && col === playbackPosition;

        let note = "Nan";
        let isNoteStart = false;

        if (currentMusic.notes[col] && Array.isArray(currentMusic.notes[col]) && currentMusic.notes[col][row]) {
          const currentNote = currentMusic.notes[col][row];
          if (currentNote && currentNote.note !== "Nan") {
            note = currentNote.note;
            isNoteStart = true;
          }
        }

        return {
          cellKey,
          isActive,
          row,
          col,
          note,
          isNoteStart,
          isPlayingColumn
        };
      })
    ).flat();
  }, [activeCells, currentMusic, isPlaying, playbackPosition, playbackStartPosition]);


  const handleMouseDown = useCallback((row: number, col: number) => {
    if (isMouseDown) return;
    setIsMouseDown(true);
    setStartPosition([row, col]);
  }, []);

  const handleMouseUp = useCallback((row: number, col: number) => {
    if (!isMouseDown) return;

    setIsMouseDown(false);

    if (row === startPosition[0]) {
      if (startPosition[1] === col) {
        let noteStartCol = col;
        let noteToRemove = null;

        if (currentMusic.notes[col] && currentMusic.notes[col][row] && currentMusic.notes[col][row].note !== "Nan") {
          noteStartCol = col;
          noteToRemove = currentMusic.notes[col][row];
        }

        if (noteToRemove) {
          setCurrentMusic(prevMusic => {
            const newMusic = { ...prevMusic };
            newMusic.notes = newMusic.notes.map(column => column ? [...column] : []);
            if (!newMusic.notes[noteStartCol]) {
              newMusic.notes[noteStartCol] = [];
            }
            newMusic.notes[noteStartCol][row] = { note: "Nan", duration: 1, instrument: "" };

            const newActiveCells = new Set<string>();
            for (let i = 0; i < newMusic.notes.length; i++) {
              if (newMusic.notes[i] && Array.isArray(newMusic.notes[i])) {
                for (let j = 0; j < newMusic.notes[i].length; j++) {
                  const note = newMusic.notes[i][j];
                  if (note && note.note !== "Nan") {
                    const duration = note.duration || 1;
                    for (let k = 0; k < duration; k++) {
                      if (i + k < newMusic.notes.length) {
                        const cellKey = `${j}-${i + k}`;
                        newActiveCells.add(cellKey);
                      }
                    }
                  }
                }
              }
            }
            setActiveCells(newActiveCells);

            return newMusic;
          });
        } else {
          const newActiveCells = new Set(activeCells);
          const cellKey = `${row}-${col}`;
          newActiveCells.add(cellKey);
          setActiveCells(newActiveCells);

          setCurrentMusic(prevMusic =>
            setNote(prevMusic, col, row, 1, currentInstrument)
          );
        }
      } else {
        const newActiveCells = new Set(activeCells);
        for (let i = Math.min(startPosition[1], col); i <= Math.max(startPosition[1], col); i++) {
          const cellKey = `${row}-${i}`;
          if (!newActiveCells.has(cellKey)) {
            newActiveCells.add(cellKey);
          }
        }
        setActiveCells(newActiveCells);

        setCurrentMusic(prevMusic =>
          setNote(prevMusic, startPosition[1], row, Math.max(1, Math.abs(startPosition[1] - col) + 1), currentInstrument)
        );
      }
      setStartPosition([-1, -1]);
    }
  }, [isMouseDown, startPosition, activeCells, currentInstrument, currentMusic]);

  const handleMouseOver = useCallback((row: number, col: number) => {
    if (!isMouseDown) return;

    if (row === startPosition[0]) {
      const newActiveCells = new Set(activeCells);
      for (let i = Math.min(startPosition[1], col); i <= Math.max(startPosition[1], col); i++) {
        const cellKey = `${row}-${i}`;
        if (!newActiveCells.has(cellKey)) {
          newActiveCells.add(cellKey);
        }
      }
      setActiveCells(newActiveCells);
    }
  }, [isMouseDown, startPosition, activeCells]);

  const clearMusic = useCallback(() => {
    setActiveCells(new Set());
    setCurrentMusic(createMusic());
    setPlaybackPosition(0);
    setPlaybackStartPosition(0);
  }, []);

  const handlePlay = useCallback(async () => {
    if (isPlaying) return;

    setIsPlaying(true);
    setPlaybackPosition(playbackStartPosition);

    const beatDuration = (60 / currentMusic.bpm) * 1000; // Convert to ms
    const startPosition = playbackStartPosition;
    // Use the last column with notes to determine actual playback end
    const actualEndColumn = getLastColumnWithNotes;
    const totalBeats = actualEndColumn - playbackStartPosition;
    const totalDuration = totalBeats * beatDuration;

    try {
      // Start playing music - progress callback will fire when notes actually play
      await playMusicFromPosition(
        currentMusic,
        playbackStartPosition,
        (position, totalLength) => {
          // This callback fires exactly when each column's notes start playing
          console.log("current col:", position);
          setPlaybackPosition(position);

          // Stop at the actual end
          if (position >= actualEndColumn) {
            setPlaybackPosition(actualEndColumn);
            setPlaybackStartPosition(0);
            setIsPlaying(false);
          }
        },
        (audioStart) => {
          // Audio start callback (kept for compatibility but not used for progress tracking)
        }
      );

      // Wait for the actual playback duration before resetting
      // The progress callback will handle stopping at the end
      setTimeout(() => {
        setPlaybackPosition(0);
        setPlaybackStartPosition(0);
        setIsPlaying(false);
      }, totalDuration + 200); // Add 200ms buffer for safety
    } catch (error) {
      console.error("Error playing music:", error);
      setPlaybackPosition(0);
      setPlaybackStartPosition(0);
      setIsPlaying(false);
    }
  }, [currentMusic, isPlaying, playbackStartPosition, getLastColumnWithNotes]);

  const handleSeek = useCallback((position: number) => {
    if (isPlaying) return; // Don't allow seeking while playing
    setPlaybackStartPosition(position);
    setPlaybackPosition(position);
  }, [isPlaying]);

  useEffect(() => {
    setMusics(prevMusics => {
      const newMusics = [...prevMusics];
      newMusics[selectedMusicIndex] = currentMusic;
      return newMusics;
    });
  }, [currentMusic, selectedMusicIndex]);

  const loadStateFromMusic = useCallback((id: number) => {
    const music = musics[id];
    setSelectedMusicIndex(id);
    setCurrentMusic(music);
    setPlaybackPosition(0);
    setPlaybackStartPosition(0);

    const newActiveCells = new Set<string>();
    for (let i = 0; i < music.notes.length; i++) {
      if (music.notes[i] && Array.isArray(music.notes[i])) {
        for (let j = 0; j < music.notes[i].length; j++) {
          const note = music.notes[i][j];
          if (note && note.note !== "Nan") {
            const duration = note.duration;
            for (let k = 0; k < duration; k++) {
              newActiveCells.add(`${j}-${i + k}`);
            }
          }
        }
      }
    }
    setActiveCells(newActiveCells);
  }, [musics]);


  useEffect(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_INSTRUMENTS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const customMap = new Map<string, InstrumentConfig>();
        const instrumentsMap = new Map(defaultInstruments);

        Object.entries(parsed).forEach(([name, config]: [string, any]) => {
          customMap.set(name, config as InstrumentConfig);
          instrumentsMap.set(name, name.charAt(0).toUpperCase() + name.slice(1));
          registerCustomInstrument(name, config);
        });

        setCustomInstruments(customMap);
        setInstruments(instrumentsMap);
      }
    } catch (error) {
      console.error("Failed to load custom instruments:", error);
    }
  }, []);


  useEffect(() => {
    if (customInstruments.size > 0) {
      try {
        const toStore: Record<string, InstrumentConfig> = {};
        customInstruments.forEach((config, name) => {
          toStore[name] = config;
        });
        localStorage.setItem(CUSTOM_INSTRUMENTS_STORAGE_KEY, JSON.stringify(toStore));
      } catch (error) {
        console.error("Failed to save custom instruments:", error);
      }
    }
  }, [customInstruments]);

  const handleSaveInstrument = useCallback((name: string, config: InstrumentConfig) => {
    const normalizedName = name.toLowerCase().replace(/\s+/g, "-");
    const isEditing = editingInstrument !== undefined;
    const oldKey = editingInstrument?.originalKey;


    if (isEditing && oldKey && oldKey !== normalizedName) {

      setCustomInstruments(prev => {
        const newMap = new Map(prev);
        newMap.delete(oldKey);
        return newMap;
      });

      setInstruments(prev => {
        const newMap = new Map(prev);
        newMap.delete(oldKey);
        return newMap;
      });


      if (currentInstrument === oldKey) {
        setCurrentInstrument(normalizedName);
      }


      try {
        const stored = localStorage.getItem(CUSTOM_INSTRUMENTS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          delete parsed[oldKey];
          localStorage.setItem(CUSTOM_INSTRUMENTS_STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (error) {
        console.error("Failed to update localStorage:", error);
      }
    } else if (isEditing && oldKey) {

      try {
        const stored = localStorage.getItem(CUSTOM_INSTRUMENTS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          delete parsed[oldKey];
          localStorage.setItem(CUSTOM_INSTRUMENTS_STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (error) {
        console.error("Failed to update localStorage:", error);
      }
    }


    registerCustomInstrument(normalizedName, config);


    setCustomInstruments(prev => {
      const newMap = new Map(prev);
      newMap.set(normalizedName, config);
      return newMap;
    });

    setInstruments(prev => {
      const newMap = new Map(prev);
      newMap.set(normalizedName, name);
      return newMap;
    });

    setEditingInstrument(undefined);
  }, [editingInstrument, currentInstrument]);

  const handleNewInstrument = useCallback(() => {
    setEditingInstrument(undefined);
    setIsInstrumentEditorOpen(true);
  }, []);

  const handleCloseInstrumentEditor = useCallback(() => {
    setIsInstrumentEditorOpen(false);
    setEditingInstrument(undefined);
  }, []);

  const handleEditInstrument = useCallback((instrument: string) => {
    const config = customInstruments.get(instrument);
    if (config) {

      const displayName = instruments.get(instrument) || instrument;
      setEditingInstrument({ name: displayName, config, originalKey: instrument });
      setIsInstrumentEditorOpen(true);
    }
  }, [customInstruments, instruments]);

  const handleDeleteInstrument = useCallback((instrument: string) => {
    if (window.confirm(`Are you sure you want to delete "${instruments.get(instrument) || instrument}"?`)) {

      setCustomInstruments(prev => {
        const newMap = new Map(prev);
        newMap.delete(instrument);
        return newMap;
      });


      setInstruments(prev => {
        const newMap = new Map(prev);
        newMap.delete(instrument);
        return newMap;
      });


      if (currentInstrument === instrument) {
        setCurrentInstrument("piano");
      }


      try {
        const stored = localStorage.getItem(CUSTOM_INSTRUMENTS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          delete parsed[instrument];
          localStorage.setItem(CUSTOM_INSTRUMENTS_STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (error) {
        console.error("Failed to delete instrument from localStorage:", error);
      }
    }
  }, [customInstruments, instruments, currentInstrument]);

  return (
    <div onMouseUp={() => setIsMouseDown(false)} style={{ width: "100%", overflow: "hidden" }}>
      <div className="SoundEditor" style={{ width: "fit-content", maxWidth: "100%" }}>
        <ControlButtons
          isPlaying={isPlaying}
          onPlay={handlePlay}
          onClear={clearMusic}
        />
        <EditorContainer>
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <InstrumentButtons
              instruments={instruments}
              currentInstrument={currentInstrument}
              onInstrumentSelect={setCurrentInstrument}
              customInstruments={new Set(customInstruments.keys())}
              onEdit={handleEditInstrument}
              onDelete={handleDeleteInstrument}
            />
            <MusicEditorButton
              onClick={handleNewInstrument}
              style={{ marginTop: "10px" }}
            >
              New Instrument
            </MusicEditorButton>
          </Box>
          <MusicGrid
            gridCells={gridCells}
            onMouseDown={handleMouseDown}
            onMouseOver={handleMouseOver}
            onMouseUp={handleMouseUp}
            playbackPosition={playbackPosition}
            totalLength={currentMusic.length}
            maxLength={getLastColumnWithNotes}
            onSeek={handleSeek}
          />
          <MusicSelectionButtons
            musics={musics}
            selectedMusicIndex={selectedMusicIndex}
            onMusicSelect={loadStateFromMusic}
          />
        </EditorContainer>
        {loadingError && (
          <ErrorMessage>
            Warning: Failed to load some instruments. Using fallback audio.
          </ErrorMessage>
        )}
      </div>
      <InstrumentEditor
        open={isInstrumentEditorOpen}
        onClose={handleCloseInstrumentEditor}
        onSave={handleSaveInstrument}
        editingInstrument={editingInstrument}
      />
    </div>
  );
};
