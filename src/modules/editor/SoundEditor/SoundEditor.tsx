import React, { useState, useCallback, useEffect, useMemo } from "react";
import { styled } from "@mui/material/styles";
import { Box } from "@mui/material";
import { Doc } from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { createMusic, MusicData, setNote, playMusic } from "./Music";
import { preloadInstruments } from "./Note";
import "./SoundEditor.css";

const ButtonContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "row",
  justifyContent: "center",
  marginTop: theme.spacing(2.5),
  flexWrap: "wrap",
  alignItems: "center",
  maxWidth: "20%",
  maxHeight: theme.spacing(70),
  overflowY: "scroll",
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

const instruments: Map<string, string> = new Map([
  ["piano", "Piano"],
  ["guitar-acoustic", "Guitar"],
  ["guitar-electric", "Guitar Electric"],
  ["guitar-nylon", "Guitar Nylon"],
  ["bass-electric", "Bass Electric"],
  ["harp", "Harp"],
  ["french-horn", "French Horn"],
  ["flute", "Flute"],
  ["saxophone", "Saxophone"],
  ["trumpet", "Trumpet"],
  ["trombone", "Trombone"],
  ["tuba", "Tuba"],
  ["violin", "Violin"],
  ["cello", "Cello"],
  ["contrabass", "Contrabass"],
  ["bassoon", "Bassoon"],
  ["clarinet", "Clarinet"],
  ["organ", "Organ"],
  ["xylophone", "Xylophone"],
  ["harmonium", "Harmonium"],
]);

interface SoundEditorProps {
  ydoc?: Doc;
  provider?: WebrtcProvider;
}

export const SoundEditor: React.FC<SoundEditorProps> = ({ ydoc, provider }) => {
  const [currentMusic, setCurrentMusic] = useState<MusicData>(createMusic());
  const [currentInstrument, setCurrentInstrument] = useState<string>("piano");
  const [activeCells, setActiveCells] = useState<Set<string>>(new Set());
  const [selectedMusicIndex, setSelectedMusicIndex] = useState<number>(0);
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);
  const [startPosition, setStartPosition] = useState<[number, number]>([-1, -1]);
  const [musics, setMusics] = useState<MusicData[]>(() => Array(16).fill(null).map(() => createMusic()));
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [instrumentsLoaded, setInstrumentsLoaded] = useState<boolean>(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    preloadInstruments()
      .then(() => {
        if (isMounted) {
          setInstrumentsLoaded(true);
          console.log("Instruments loaded successfully");
        }
      })
      .catch((error) => {
        if (isMounted) {
          setLoadingError(error.message);
          console.error("Failed to load instruments:", error);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (ydoc && provider) {
      console.log("Active cells changed:", Array.from(activeCells));
    }
  }, [activeCells, ydoc, provider]);

  useEffect(() => {
    if (ydoc && provider) {
      console.log("Music data changed:", currentMusic);
    }
  }, [currentMusic, ydoc, provider]);

  const gridCells = useMemo(() => {
    return [...Array(24)].map((_, row) =>
      [...Array(32)].map((_, col) => {
        const cellKey = `${row}-${col}`;
        const isActive = activeCells.has(cellKey);

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
          isNoteStart
        };
      })
    ).flat();
  }, [activeCells, currentMusic]);

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
  }, []);

  const handlePlay = useCallback(async () => {
    if (isPlaying) return;

    setIsPlaying(true);
    try {
      await playMusic(currentMusic);
    } catch (error) {
      console.error("Error playing music:", error);
    } finally {
      setIsPlaying(false);
    }
  }, [currentMusic, isPlaying]);

  const saveMusic = useCallback(() => {
    setMusics(prevMusics => {
      const newMusics = [...prevMusics];
      newMusics[selectedMusicIndex] = currentMusic;
      return newMusics;
    });
  }, [selectedMusicIndex, currentMusic]);

  const loadStateFromMusic = useCallback((id: number) => {
    const music = musics[id];
    setSelectedMusicIndex(id);
    setCurrentMusic(music);

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

  const instrumentButtons = useMemo(() => (
    Array.from(instruments.keys()).map((instrument) => (
      <MusicEditorButton
        className={currentInstrument === instrument ? "selected" : ""}
        key={instrument}
        onClick={() => setCurrentInstrument(instrument)}
      >
        {instruments.get(instrument)}
      </MusicEditorButton>
    ))
  ), [currentInstrument]);

  const musicSelectionButtons = useMemo(() => (
    musics.map((_, index) => (
      <MusicEditorButton
        className={selectedMusicIndex === index ? "selected" : ""}
        key={index}
        onClick={() => loadStateFromMusic(index)}
      >
        {index + 1}
      </MusicEditorButton>
    ))
  ), [musics, selectedMusicIndex, loadStateFromMusic]);

  return (
    <div onMouseUp={() => setIsMouseDown(false)}>
      <div className="SoundEditor">
        <div className="editor-container">
          <ButtonContainer>
            {instrumentButtons}
          </ButtonContainer>
          <div className="scrollable-container">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${32}, 35px)`,
                gridTemplateRows: `repeat(${24}, 20px)`,
              }}
            >
              {gridCells.map((cell) => (
                <div
                  key={cell.cellKey}
                  onMouseDown={() => handleMouseDown(cell.row, cell.col)}
                  onMouseOver={() => handleMouseOver(cell.row, cell.col)}
                  onMouseUp={() => handleMouseUp(cell.row, cell.col)}
                  className={`cell ${cell.isActive ? "selected" : ""}`}
                  style={{
                    width: "35px",
                    height: "20px",
                    boxSizing: "border-box"
                  }}
                >
                  {cell.isNoteStart ? cell.note : ""}
                </div>
              ))}
            </div>
          </div>
          <ButtonContainer>
            {musicSelectionButtons}
          </ButtonContainer>
        </div>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-around",
            marginTop: "20px"
          }}
        >
          <MusicEditorButton onClick={handlePlay} disabled={isPlaying || !instrumentsLoaded}>
            {isPlaying ? "Playing..." : instrumentsLoaded ? "Play" : "Loading..."}
          </MusicEditorButton>
          <MusicEditorButton onClick={clearMusic}>Clear</MusicEditorButton>
          <MusicEditorButton onClick={saveMusic}>Save</MusicEditorButton>
        </Box>
      </div>
    </div>
  );
};
