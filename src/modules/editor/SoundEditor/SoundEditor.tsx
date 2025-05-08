import IEditor from "@modules/editor/IEditor";
import Music from "@modules/editor/SoundEditor/Music";
import "./SoundEditor.css";
import { Doc } from "yjs";
import { WebrtcProvider } from "y-webrtc";
import styled, { DefaultTheme } from "styled-components";
import { c } from "node_modules/vite/dist/node/moduleRunnerTransport.d-CXw_Ws6P";

const ButtonContainer = styled.div <{ theme: DefaultTheme }>`
    display: flex;
    flex-direction: row;
    justify-content: center;
    margin-top: ${({ theme }) => theme.spacing(2.5)};
    flex-wrap: wrap;
    align-items: center;
    max-width: 20%;
    max-height: ${({ theme }) => theme.spacing(70)};
    overflow-y: scroll;
`;

const MusicEditorButton = styled.button <{ theme: DefaultTheme }>`
    background-color: ${({ theme }) => theme.colors.blue[500]};
    color: ${({ theme }) => theme.colors.text};
    padding: ${({ theme }) => theme.spacing(1)} ${({ theme }) => theme.spacing(2)};
    cursor: pointer;
    font-size: ${({ theme }) => theme.typography.fontSize}px;
    text-align: center;
    text-decoration: none;
    display: inline-block;
    margin: ${({ theme }) => theme.spacing(0.5)} ${({ theme }) => theme.spacing(0.25)};
    font-family: ${({ theme }) => theme.typography.fontFamily};
    border-radius: ${({ theme }) => theme.spacing(1.2)};
    border: ${({ theme }) => theme.spacing(0.25)} solid ${({ theme }) => theme.colors.blue[600]};

    &:hover {
        background-color: ${({ theme }) => theme.colors.blue[600]};
    }

    &.selected {
        background-color: ${({ theme }) => theme.colors.blue[600]};
    }
`;

interface SoundEditorState {
  
}

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

import React from "react";

export class SoundEditor extends IEditor {

  private _musics: Music[];
  private provider: WebrtcProvider | undefined = undefined;
  private ydoc: Doc | undefined = undefined;
  private _isMouseDown: boolean = false;
  private _startPosition: [number, number] = [-1, -1];

  constructor(numberMusics: number = 16) {
    super();
    this.tabData = {
      title: "Sound",
      icon: "sound",
    };
    this.state = {
      currentMusic: new Music(),
      currentInstrument: "piano",
      activeCells: new Set<string>(),
      selectedMusicIndex: 0,
    };
    this._musics = new Array<Music>(numberMusics);
    for (let i = 0; i < 16; i++) {
      this._musics[i] = new Music();
    }
  }

  public init(ydoc: Doc, provider: WebrtcProvider): void {
    this.provider = provider;
    this.ydoc = ydoc;
  }

  sendData(data: string): void {
    console.log("SoundEditor sendData", data);
  }

  loadData(data: string): void {
    console.log("SoundEditor loadData", data);
  }

  handleCellClick(endRow: number, endCol: number): void {

    if (this._isMouseDown) {
      if (this._startPosition[0] == -1) {
        this._startPosition[0] = endRow;
        this._startPosition[1] = endCol;
      }
      return;
    }
    if (endRow == this._startPosition[0]) {

      for (let i = Math.min(this._startPosition[1], endCol); i <= Math.max(this._startPosition[1], endCol); i++) {
        const row = this._startPosition[0];
        const col = i;
        const cellKey = `${row}-${col}`;

        this.setState((prevState) => {
          const newActiveCells = new Set(prevState.activeCells);
          if (newActiveCells.has(cellKey)) {
            newActiveCells.delete(cellKey);
          } else {
            newActiveCells.add(cellKey);
          }
          return { activeCells: newActiveCells };
        });
        this.setState({ startPosition: [-1, -1] });
      }
      this.state.currentMusic.setNote(this._startPosition[1], this._startPosition[0], Math.max(1, Math.abs(this._startPosition[1] - endCol)), this.state.currentInstrument);
    }

  }

  clearMusic() {
    this.setState({ activeCells: new Set<string>() });
    this.state.currentMusic = new Music();
  }

  getInstrumentButtons() {
    return Array.from(instruments.keys()).map((instrument) => (
      <MusicEditorButton
        className={`flex-item-grow ${this.state.currentInstrument === instrument ? "selected" : ""}`}
        key={instrument}
        onClick={() => {
          this.setState({ currentInstrument: instrument });
        }}
      >
        {instruments.get(instrument)}
      </MusicEditorButton>
    ));
  }

  saveMusic() {
    const musicData = this.state.currentMusic.toJson();
    console.log("Music data to save:", musicData);
    this._musics[this.state.selectedMusicIndex] = (Music.fromJson(musicData));
  }

  loadStateFromMusic(id: number) {
    const music = this._musics[id];
    this.setState({ selectedMusicIndex: id });
    this.setState({ currentMusic: music });
    this.setState({ activeCells: new Set<string>() });
    for (let i = 0; i < music.notes.length; i++) {
      for (let j = 0; j < music.notes[i].length; j++) {
        if (music.notes[i][j].note != "Nan") {
          const cellKey = `${j}-${i}`;
          this.setState((prevState) => {
            const newActiveCells = new Set(prevState.activeCells);
            newActiveCells.add(cellKey);
            return { activeCells: newActiveCells };
          });
        }
      }
    }
  }

  componentDidMount() {
    window.addEventListener("mouseup", this.handleMouseUp);
  }

  componentWillUnmount() {
    window.removeEventListener("mouseup", this.handleMouseUp);
  }

  handleMouseUp = () => this.setState({ isMouseDown: false });

  render() {
    //const theme = useTheme()
    const cellWidth = 35;
    const cellHeight = 20;
    const gridWidth = 32;
    const gridHeight = 24;
    return (
      <div>
        <div className="SoundEditor">

          <div className="editor-container">
            <ButtonContainer>
              {this.getInstrumentButtons()}
            </ButtonContainer>
            <div className="scrollable-container">
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${gridWidth}, ${cellWidth}px)`,
                  gridTemplateRows: `repeat(${gridHeight}, ${cellHeight}px)`,
                }}
              >
                {[...Array(gridHeight)].map((_, row) =>
                  [...Array(gridWidth)].map((_, col) => {
                    const cellKey = `${row}-${col}`;
                    const isActive = this.state.activeCells.has(cellKey);
                    return (
                      <div
                        key={cellKey}
                        onMouseDown={() => {
                          this._isMouseDown = true;
                          this.handleCellClick(row, col);
                          this.setState({ startPosition: [row, col] });
                        }}
                        onMouseOver={() => {
                          if (this._isMouseDown) {
                            this.handleCellClick(row, col);
                          }
                        }}
                        onMouseUp={() => {
                          this._isMouseDown = false;
                          this.handleCellClick(row, col);
                          this._startPosition[0] = -1;
                          this._startPosition[1] = -1;
                        }}
                        className={`cell ${isActive ? "selected" : ""}`}
                        style={{
                          width: `${cellWidth}px`,
                          height: `${cellHeight}px`,
                          boxSizing: "border-box"
                        }}
                      >
                        {this.state.currentMusic.notes[col][row].note == "Nan" ? "" : this.state.currentMusic.notes[col][row].note}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <ButtonContainer>
              {this._musics.map((_, index) => (
                <MusicEditorButton className={`music-selection-button ${this.state.selectedMusicIndex == index ? "selected" : ""}`} key={index} onClick={() => this.loadStateFromMusic(index)}>
                  {index + 1}
                </MusicEditorButton>
              ))}
            </ButtonContainer>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-around",
              marginTop: "20px"
            }}
          >
            <MusicEditorButton onClick={() => this.state.currentMusic.play()} >Play</MusicEditorButton>
            <MusicEditorButton onClick={() => this.clearMusic()} >Clear</MusicEditorButton>
            <MusicEditorButton onClick={() => this.saveMusic()} >Save</MusicEditorButton>
          </div>
        </div>
      </div >
    );
  }

}
