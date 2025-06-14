import React, { useState, useCallback, useEffect, useMemo } from "react";
import { styled } from "@mui/material/styles";
import { Box } from "@mui/material";
import { Doc } from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { createMusic, MusicData, setNote, playMusic } from "./Music";
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

  // Effect to handle active cells changes
  useEffect(() => {
    // You could add any side effects related to active cells here
    // For example, saving to localStorage or syncing with ydoc
    if (ydoc && provider) {
      // Sync active cells with ydoc if needed
      console.log("Active cells changed:", Array.from(activeCells));
    }
  }, [activeCells, ydoc, provider]);

  // Effect to handle music changes
  useEffect(() => {
    if (ydoc && provider) {
      // Sync music data with ydoc if needed
      console.log("Music data changed:", currentMusic);
    }
  }, [currentMusic, ydoc, provider]);

  // Memoize the grid cells to prevent unnecessary re-renders
  const gridCells = useMemo(() => {
    return [...Array(24)].map((_, row) =>
      [...Array(32)].map((_, col) => {
        const cellKey = `${row}-${col}`;
        const isActive = activeCells.has(cellKey);
        return {
          cellKey,
          isActive,
          row,
          col,
          note: currentMusic.notes[col][row].note
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
      const newActiveCells = new Set(activeCells);
      for (let i = Math.min(startPosition[1], col); i <= Math.max(startPosition[1], col); i++) {
        const cellKey = `${row}-${i}`;
        if (!newActiveCells.has(cellKey)) {
          newActiveCells.add(cellKey);
        }
      }
      setActiveCells(newActiveCells);
      setStartPosition([-1, -1]);

      setCurrentMusic(prevMusic =>
        setNote(prevMusic, startPosition[1], row, Math.max(1, Math.abs(startPosition[1] - col)), currentInstrument)
      );
    }
  }, [isMouseDown, startPosition, activeCells, currentInstrument]);

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

    // Calculate active cells in a separate effect
    const newActiveCells = new Set<string>();
    for (let i = 0; i < music.notes.length; i++) {
      for (let j = 0; j < music.notes[i].length; j++) {
        if (music.notes[i][j].note !== "Nan") {
          newActiveCells.add(`${j}-${i}`);
        }
      }
    }
    setActiveCells(newActiveCells);
  }, [musics]);

  // Memoize instrument buttons to prevent unnecessary re-renders
  const instrumentButtons = useMemo(() => (
    Array.from(instruments.keys()).map((instrument) => (
      <MusicEditorButton
        className={currentInstrument === instrument ? "selected" : ""}
        key={instrument}
        variant="contained"
        onClick={() => setCurrentInstrument(instrument)}
      >
        {instruments.get(instrument)}
      </MusicEditorButton>
    ))
  ), [currentInstrument]);

  // Memoize music selection buttons
  const musicSelectionButtons = useMemo(() => (
    musics.map((_, index) => (
      <MusicEditorButton
        className={selectedMusicIndex === index ? "selected" : ""}
        key={index}
        variant="contained"
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
                  {cell.note === "Nan" ? "" : cell.note}
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
          <MusicEditorButton variant="contained" onClick={() => playMusic(currentMusic)}>Play</MusicEditorButton>
          <MusicEditorButton variant="contained" onClick={clearMusic}>Clear</MusicEditorButton>
          <MusicEditorButton variant="contained" onClick={saveMusic}>Save</MusicEditorButton>
        </Box>
      </div>
    </div>
  );
};
