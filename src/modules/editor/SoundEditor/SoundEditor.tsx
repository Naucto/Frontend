import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Box } from "@mui/material";
import { styled } from "@mui/material/styles";
import * as Tone from "tone";
import { createMusic, MusicData, setNote, playMusicFromPosition } from "./Music";
import { registerCustomInstrument, stopAllSynths, NoteData } from "./Note";
import { InstrumentEditor, InstrumentConfig } from "./InstrumentEditor";
import { EditorProps } from "@modules/create/game-editor/editors/EditorType";
import { MusicGrid } from "./MusicGrid";

const ButtonContainer = styled(Box)(() => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
  gap: "8px",
  marginTop: "20px",
  width: "100%",
  maxWidth: "250px",
}));

const MusicSelectionContainer = styled(Box)(() => ({
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "4px",
  marginTop: "20px",
  width: "100%",
  maxWidth: "150px",
}));

const StyledButton = styled("button")<{ selected?: boolean }>(({ selected }) => ({
  backgroundColor: selected ? "#4c7280" : "#537d8d",
  color: "#ffffff",
  padding: "8px 16px",
  cursor: "pointer",
  fontSize: "16px",
  textAlign: "center",
  textDecoration: "none",
  display: "inline-block",
  boxShadow: "none",
  margin: "4px 2px",
  fontFamily: "'Pixelify', 'Roboto', 'Helvetica', 'Arial', sans-serif",
  borderRadius: "9.6px",
  border: "2px solid #4c7280",
  minWidth: "auto",
  "&:hover": {
    backgroundColor: "#3b5964",
  },
}));

const MusicSelectionButton = styled(StyledButton)(() => ({
  padding: "4px 8px",
  fontSize: "12px",
  minWidth: "auto",
  width: "100%",
}));

const NewInstrumentButton = styled(StyledButton)(({ theme }) => ({
  marginTop: theme.spacing(1),
}));

const ControlButtonsContainer = styled("div")(() => ({
  display: "flex",
  justifyContent: "space-around",
  marginTop: "20px",
}));

const EditorContainer = styled("div")(() => ({
  display: "flex",
  gap: "20px",
  alignItems: "flex-start",
  width: "100%",
  maxWidth: "100%",
  overflow: "hidden",
}));

const SoundEditorRoot = styled("div")(() => ({
  width: "100%",
  overflow: "hidden",
}));

const ErrorMessage = styled("div")(() => ({
  color: "red",
  textAlign: "center",
  marginTop: "10px",
}));

const SoundEditorWrapper = styled("div")(() => ({
  width: "fit-content",
  maxWidth: "100%",
}));

const defaultInstruments: Map<string, string> = new Map([
  ["piano", "Piano"],
  ["guitar", "Guitar"],
  ["flute", "Flute"],
  ["trumpet", "Trumpet"],
  ["contrabass", "Contrabass"],
  ["harmonica", "Harmonica"],
]);

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
          <StyledButton
            selected={currentInstrument === instrument}
            key={instrument}
            onClick={() => onInstrumentSelect(instrument)}
            style={{ width: "100%" }}
          >
            {instruments.get(instrument)}
          </StyledButton>
        ))}
      </ButtonContainer>
      {isCustomInstrument && onEdit && onDelete && (
        <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
          <StyledButton
            onClick={() => onEdit(currentInstrument)}
            style={{ backgroundColor: "#4caf50", borderColor: "#45a049" }}
          >
            Edit
          </StyledButton>
          <StyledButton
            onClick={() => onDelete(currentInstrument)}
            style={{ backgroundColor: "#f44336", borderColor: "#da190b" }}
          >
            Delete
          </StyledButton>
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
      <MusicSelectionButton
        selected={selectedMusicIndex === index}
        key={index}
        onClick={() => onMusicSelect(index)}
      >
        {index + 1}
      </MusicSelectionButton>
    ))}
  </MusicSelectionContainer>
);

interface ControlButtonsProps {
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  onClear: () => void;
}

const ControlButtons: React.FC<ControlButtonsProps> = ({
  isPlaying,
  onPlay,
  onStop,
  onClear,
}) => (
  <ControlButtonsContainer>
    <StyledButton onClick={isPlaying ? onStop : onPlay}>
      {isPlaying ? "Stop" : "Play"}
    </StyledButton>
    <StyledButton onClick={onClear}>Clear</StyledButton>
  </ControlButtonsContainer>
);

export const SoundEditor: React.FC<EditorProps> = ({ project }) => {
  if (!project || !project.sound) {
    return <div>Loading sound editor...</div>;
  }

  const soundProvider = project.sound;

  const [musics, setMusics] = useState<MusicData[]>([]);
  const [selectedMusicIndex, setSelectedMusicIndex] = useState<number>(0);
  const [currentMusic, setCurrentMusic] = useState<MusicData>(createMusic());
  const [customInstruments, setCustomInstruments] = useState<Map<string, InstrumentConfig>>(new Map());
  const [instruments, setInstruments] = useState<Map<string, string>>(new Map(defaultInstruments));

  const [currentInstrument, setCurrentInstrument] = useState<string>("piano");
  const [activeCells, setActiveCells] = useState<Set<string>>(new Set());
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);
  const [startPosition, setStartPosition] = useState<[number, number]>([-1, -1]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [loadingError] = useState<string | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState<number>(0);
  const [playbackStartPosition, setPlaybackStartPosition] = useState<number>(0);
  const [isInstrumentEditorOpen, setIsInstrumentEditorOpen] = useState<boolean>(false);
  const [editingInstrument, setEditingInstrument] = useState<{ name: string; config: InstrumentConfig; originalKey?: string } | undefined>(undefined);
  const [lastColumnWithNotes, setLastColumnWithNotes] = useState<number>(0);

  const playbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldStopRef = useRef<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);

  useEffect(() => {
    const handleUpdate = (updatedMusics: MusicData[]): void => {
      setMusics(updatedMusics);
      setCurrentMusic(updatedMusics[selectedMusicIndex] || createMusic());
    };

    soundProvider.observe(handleUpdate);
    return () => {
      soundProvider.unobserve(handleUpdate);
    };
  }, [soundProvider, selectedMusicIndex]);

  useEffect(() => {
    if (musics.length > 0 && selectedMusicIndex >= 0 && selectedMusicIndex < musics.length) {
      setCurrentMusic(musics[selectedMusicIndex] || createMusic());
    }
  }, [selectedMusicIndex, musics]);

  useEffect(() => {
    const handleCustomInstrumentsUpdate = (updatedInstruments: Map<string, InstrumentConfig>): void => {
      setCustomInstruments(updatedInstruments);
      const instrumentsMap = new Map(defaultInstruments);
      updatedInstruments.forEach((_, name) => {
        instrumentsMap.set(name, name.charAt(0).toUpperCase() + name.slice(1));
      });
      setInstruments(instrumentsMap);
    };

    soundProvider.observeCustomInstruments(handleCustomInstrumentsUpdate);
    return () => {
      soundProvider.unobserveCustomInstruments(handleCustomInstrumentsUpdate);
    };
  }, [soundProvider]);

  const notesKey = useMemo(() => JSON.stringify(currentMusic.notes), [currentMusic.notes]);

  const calculateActiveCells = useCallback((notes: (NoteData[] | null)[]): Set<string> => {
    const activeCells = new Set<string>();
    notes.forEach((column, columnIndex) => {
      if (!column || !Array.isArray(column)) return;
      column.forEach((note, rowIndex) => {
        if (!note || note.note === "Nan") return;
        const duration = note.duration || 1;
        for (let k = 0; k < duration; k++) {
          if (columnIndex + k < notes.length) {
            activeCells.add(`${rowIndex}-${columnIndex + k}`);
          }
        }
      });
    });
    return activeCells;
  }, []);

  useEffect(() => {
    const newActiveCells = calculateActiveCells(currentMusic.notes);
    setActiveCells(newActiveCells);
  }, [currentMusic, notesKey, calculateActiveCells]);

  useEffect(() => {
    let lastColumn = -1;
    const maxColumn = Math.max(currentMusic.length, 32);
    for (let i = maxColumn - 1; i >= 0; i--) {
      if (currentMusic.notes[i] && Array.isArray(currentMusic.notes[i]) && currentMusic.notes[i].length > 0) {
        const hasNotes = currentMusic.notes[i].some(note => note && note.note !== "Nan");
        if (hasNotes) {
          lastColumn = i;
          break;
        }
      }
    }
    const newLastColumn = lastColumn >= 0 ? lastColumn + 1 : currentMusic.length;
    setLastColumnWithNotes(newLastColumn);
  }, [currentMusic, notesKey]);

  const gridCells = useMemo(() => {
    return [...Array(24)].map((_, row) =>
      [...Array(32)].map((_, col) => {
        const cellKey = `${row}-${col}`;
        const isActive = activeCells.has(cellKey);
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
  }, [activeCells, currentMusic, isPlaying, playbackPosition]);

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
          const newMusic = { ...currentMusic };
          newMusic.notes = newMusic.notes.map(column => column ? [...column] : []);
          if (!newMusic.notes[noteStartCol]) {
            newMusic.notes[noteStartCol] = [];
          }
          newMusic.notes[noteStartCol][row] = { note: "Nan", duration: 1, instrument: "" };

          const newActiveCells = calculateActiveCells(newMusic.notes);
          setActiveCells(newActiveCells);
          soundProvider.setMusic(selectedMusicIndex, newMusic);
        } else {
          const newActiveCells = new Set(activeCells);
          const cellKey = `${row}-${col}`;
          newActiveCells.add(cellKey);
          setActiveCells(newActiveCells);

          const updatedMusic = setNote(currentMusic, col, row, 1, currentInstrument);
          soundProvider.setMusic(selectedMusicIndex, updatedMusic);
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

        const updatedMusic = setNote(currentMusic, startPosition[1], row, Math.max(1, Math.abs(startPosition[1] - col) + 1), currentInstrument);
        soundProvider.setMusic(selectedMusicIndex, updatedMusic);
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
    const clearedMusic = createMusic();
    soundProvider.setMusic(selectedMusicIndex, clearedMusic);
    setPlaybackPosition(0);
    setPlaybackStartPosition(0);
  }, [soundProvider, selectedMusicIndex]);

  const handlePlay = useCallback(async () => {
    if (isPlayingRef.current) return;

    shouldStopRef.current = false;
    isPlayingRef.current = true;
    setIsPlaying(true);
    setPlaybackPosition(playbackStartPosition);

    const beatDuration = (60 / currentMusic.bpm) * 1000;
    const actualEndColumn = lastColumnWithNotes;
    const totalBeats = actualEndColumn - playbackStartPosition;
    const totalDuration = totalBeats * beatDuration;

    try {
      await playMusicFromPosition(
        currentMusic,
        playbackStartPosition,
        (position) => {
          if (shouldStopRef.current) {
            return;
          }

          setPlaybackPosition(position);

          if (position >= actualEndColumn) {
            setPlaybackPosition(actualEndColumn);
            setPlaybackStartPosition(0);
            isPlayingRef.current = false;
            setIsPlaying(false);
            if (playbackTimeoutRef.current) {
              clearTimeout(playbackTimeoutRef.current);
              playbackTimeoutRef.current = null;
            }
          }
        },
        () => {
        },
        lastColumnWithNotes
      );

      playbackTimeoutRef.current = setTimeout(() => {
        if (!shouldStopRef.current) {
          setPlaybackPosition(0);
          setPlaybackStartPosition(0);
          isPlayingRef.current = false;
          setIsPlaying(false);
        }
        playbackTimeoutRef.current = null;
      }, totalDuration + 200);
    } catch {
      if (!shouldStopRef.current) {
        setPlaybackPosition(0);
        setPlaybackStartPosition(0);
        isPlayingRef.current = false;
        setIsPlaying(false);
      }
      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current);
        playbackTimeoutRef.current = null;
      }
    }
  }, [currentMusic, playbackStartPosition, lastColumnWithNotes]);

  const handleStop = useCallback(() => {
    if (!isPlayingRef.current) return;

    shouldStopRef.current = true;
    isPlayingRef.current = false;
    setIsPlaying(false);

    stopAllSynths();

    Tone.Transport.cancel();
    Tone.Transport.stop();

    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }

    setPlaybackStartPosition(playbackPosition);
  }, [isPlaying, playbackPosition]);

  const handleSeek = useCallback((position: number) => {
    if (isPlaying) return;
    setPlaybackStartPosition(position);
    setPlaybackPosition(position);
  }, [isPlaying]);

  const loadStateFromMusic = useCallback((id: number) => {
    const music = musics[id];
    setSelectedMusicIndex(id);
    setPlaybackPosition(0);
    setPlaybackStartPosition(0);

    const newActiveCells = calculateActiveCells(music.notes);
    setActiveCells(newActiveCells);
  }, [musics, calculateActiveCells]);

  useEffect(() => {
    const storageKey = `soundEditor_customInstruments_${project.projectId}`;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.entries(parsed).forEach(([name, config]: [string, unknown]) => {
          soundProvider.setCustomInstrument(name, config as InstrumentConfig);
          registerCustomInstrument(name, config);
        });
      }
    } catch {
      void 0;
    }
  }, [soundProvider, project.projectId]);

  useEffect(() => {
    if (customInstruments.size > 0) {
      const storageKey = `soundEditor_customInstruments_${project.projectId}`;
      try {
        const toStore: Record<string, InstrumentConfig> = {};
        customInstruments.forEach((config, name) => {
          toStore[name] = config;
        });
        localStorage.setItem(storageKey, JSON.stringify(toStore));
      } catch {
        void 0;
      }
    }
  }, [customInstruments, project.projectId]);

  const handleSaveInstrument = useCallback((name: string, config: InstrumentConfig) => {
    const normalizedName = name.toLowerCase().replace(/\s+/g, "-");
    const isEditing = editingInstrument !== undefined;
    const oldKey = editingInstrument?.originalKey;

    if (isEditing && oldKey && oldKey !== normalizedName) {
      soundProvider.deleteCustomInstrument(oldKey);
      if (currentInstrument === oldKey) {
        setCurrentInstrument(normalizedName);
      }
    }

    registerCustomInstrument(normalizedName, config);
    soundProvider.setCustomInstrument(normalizedName, config);
    setEditingInstrument(undefined);
  }, [soundProvider, editingInstrument, currentInstrument]);

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
      soundProvider.deleteCustomInstrument(instrument);
      if (currentInstrument === instrument) {
        setCurrentInstrument("piano");
      }
    }
  }, [soundProvider, instruments, currentInstrument]);

  return (
    <SoundEditorRoot onMouseUp={() => setIsMouseDown(false)}>
      <SoundEditorWrapper>
        <ControlButtons
          isPlaying={isPlaying}
          onPlay={handlePlay}
          onStop={handleStop}
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
            <NewInstrumentButton
              onClick={handleNewInstrument}
            >
              New Instrument
            </NewInstrumentButton>
          </Box>
          <MusicGrid
            gridCells={gridCells}
            onMouseDown={handleMouseDown}
            onMouseOver={handleMouseOver}
            onMouseUp={handleMouseUp}
            playbackPosition={playbackPosition}
            totalLength={currentMusic.length}
            maxLength={lastColumnWithNotes}
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
      </SoundEditorWrapper>
      <InstrumentEditor
        open={isInstrumentEditorOpen}
        onClose={handleCloseInstrumentEditor}
        onSave={handleSaveInstrument}
        editingInstrument={editingInstrument}
      />
    </SoundEditorRoot>
  );
};
