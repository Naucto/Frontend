import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Box } from "@mui/material";
import * as Tone from "tone";
import { createMusic, MusicData, setNote, playMusicFromPosition } from "./Music";
import { registerCustomInstrument, stopAllSynths } from "./Note";
import { InstrumentEditor, InstrumentConfig } from "./InstrumentEditor";
import { EditorProps } from "@modules/create/game-editor/editors/EditorType";
import "./SoundEditor.css";

const defaultInstruments: Map<string, string> = new Map([
  ["piano", "Piano"],
  ["guitar", "Guitar"],
  ["flute", "Flute"],
  ["trumpet", "Trumpet"],
  ["contrabass", "Contrabass"],
  ["harmonica", "Harmonica"],
]);

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
      <Box className="sound-editor-button-container">
        {Array.from(instruments.keys()).map((instrument) => (
          <button
            className={`sound-editor-button ${currentInstrument === instrument ? "selected" : ""}`}
            key={instrument}
            onClick={() => onInstrumentSelect(instrument)}
            style={{ width: "100%" }}
          >
            {instruments.get(instrument)}
          </button>
        ))}
      </Box>
      {isCustomInstrument && onEdit && onDelete && (
        <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
          <button
            className="sound-editor-button"
            onClick={() => onEdit(currentInstrument)}
            style={{ backgroundColor: "#4caf50", borderColor: "#45a049" }}
          >
            Edit
          </button>
          <button
            className="sound-editor-button"
            onClick={() => onDelete(currentInstrument)}
            style={{ backgroundColor: "#f44336", borderColor: "#da190b" }}
          >
            Delete
          </button>
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
  <Box className="sound-editor-music-selection-container">
    {musics.map((_, index) => (
      <button
        className={`sound-editor-button ${selectedMusicIndex === index ? "selected" : ""}`}
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
      </button>
    ))}
  </Box>
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
  <div className="sound-editor-scrollable-container">
    <div className="sound-editor-grid-with-progress-container">
      <ProgressBar
        progress={playbackPosition}
        onSeek={onSeek}
        totalLength={totalLength}
        maxLength={maxLength}
      />
      <div className="sound-editor-grid-container">
        {gridCells.map((cell) => (
          <div
            key={cell.cellKey}
            className={`sound-editor-grid-cell ${cell.isActive ? "active" : ""} ${cell.isPlayingColumn ? "playing-column" : ""}`}
            onMouseDown={() => onMouseDown(cell.row, cell.col)}
            onMouseOver={() => onMouseOver(cell.row, cell.col)}
            onMouseUp={() => onMouseUp(cell.row, cell.col)}
          >
            {cell.isNoteStart ? cell.note : ""}
          </div>
        ))}
      </div>
    </div>
  </div>
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
  <div className="sound-editor-control-buttons-container">
    <button className="sound-editor-button" onClick={isPlaying ? onStop : onPlay}>
      {isPlaying ? "Stop" : "Play"}
    </button>
    <button className="sound-editor-button" onClick={onClear}>Clear</button>
  </div>
);

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
    <div className="sound-editor-progress-bar-container" onClick={handleClick}>
      <div className="sound-editor-progress-bar-track">
        <div className="sound-editor-progress-bar-fill" style={{ width: `${fillPercentage}%` }} />
        <div className="sound-editor-progress-bar-thumb" style={{ left: `${columnCenterPosition}%` }} />
      </div>
    </div>
  );
};

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

  useEffect(() => {
    const newActiveCells = new Set<string>();
    for (let i = 0; i < currentMusic.notes.length; i++) {
      if (currentMusic.notes[i] && Array.isArray(currentMusic.notes[i])) {
        for (let j = 0; j < currentMusic.notes[i].length; j++) {
          const note = currentMusic.notes[i][j];
          if (note && note.note !== "Nan") {
            const duration = note.duration || 1;
            for (let k = 0; k < duration; k++) {
              if (i + k < currentMusic.notes.length) {
                newActiveCells.add(`${j}-${i + k}`);
              }
            }
          }
        }
      }
    }
    setActiveCells(newActiveCells);
  }, [currentMusic, notesKey]);

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
    <div onMouseUp={() => setIsMouseDown(false)} style={{ width: "100%", overflow: "hidden" }}>
      <div className="SoundEditor" style={{ width: "fit-content", maxWidth: "100%" }}>
        <ControlButtons
          isPlaying={isPlaying}
          onPlay={handlePlay}
          onStop={handleStop}
          onClear={clearMusic}
        />
        <div className="sound-editor-container">
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <InstrumentButtons
              instruments={instruments}
              currentInstrument={currentInstrument}
              onInstrumentSelect={setCurrentInstrument}
              customInstruments={new Set(customInstruments.keys())}
              onEdit={handleEditInstrument}
              onDelete={handleDeleteInstrument}
            />
            <button
              className="sound-editor-button"
              onClick={handleNewInstrument}
              style={{ marginTop: "10px" }}
            >
              New Instrument
            </button>
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
        </div>
        {loadingError && (
          <div className="sound-editor-error-message">
            Warning: Failed to load some instruments. Using fallback audio.
          </div>
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
