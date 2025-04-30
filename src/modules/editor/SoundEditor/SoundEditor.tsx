import IEditor from "@modules/editor/IEditor";
import { useTheme } from "@theme/ThemeContext"
import Music from "@modules/editor/SoundEditor/Music";
import "./SoundEditor.css"
import { Doc } from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { start } from "tone";



interface SoundEditorState {
    currentMusic: Music;
    currentInstrument: string;
    activeCells: Set<string>;
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


export class SoundEditor extends IEditor {

    private _musics: Music[];
    private provider: WebrtcProvider | null = null;
    private ydoc: Doc | null = null;
    private _isMouseDown: boolean = false;
    private _startPosition: [number, number] = [-1, -1];

    state: SoundEditorState = {
        currentMusic: new Music(),
        currentInstrument: "piano",
        activeCells: new Set<string>(),
    };

    constructor(numberMusics: number = 16) {
        super();
        this.tabData = {
            title: "Sound",
            icon: "sound",
        };
        this._musics = new Array<Music>(numberMusics);
        for (let i = 0; i < numberMusics; i++) {
            this._musics[i] = new Music();
        }
        console.log("this._currentMusic", this.state.currentMusic);
    }

    public init(ydoc: Doc, provider: WebrtcProvider): void {
        this.provider = provider;
        this.ydoc = ydoc;
    }


    sendData(data: string) {
        console.log("SoundEditor sendData", data);
    }

    loadData(data: string) {
        console.log("SoundEditor loadData", data);
    }

    handleCellClick(endRow: number, endCol: number) {

        if (this._isMouseDown) {
            if (this._startPosition[0] == -1) {
                this._startPosition[0] = endRow;
                this._startPosition[1] = endCol;
            }
            return;
        }
        console.log("handleCellClick", endRow, this._startPosition[0]);
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
            <button
                className={`button ${this.state.currentInstrument === instrument ? "selected" : ""}`}
                key={instrument}
                onClick={() => {
                    this.setState({ currentInstrument: instrument });
                }}
            >
                {instruments.get(instrument)}
            </button>
        ));
    }

    saveMusic() {
        const musicData = this.state.currentMusic.toJson();
        console.log("Music data to save:", musicData);
    }

    componentDidMount() {
        window.addEventListener("mouseup", this.handleMouseUp);
    }

    componentWillUnmount() {
        window.removeEventListener("mouseup", this.handleMouseUp);
    }

    handleMouseUp = () => {
        this.setState({ isMouseDown: false });

    };

    render() {
        //const theme = useTheme()
        const cellWidth = 35;
        const cellHeight = 20;
        const gridWidth = 32;
        const gridHeight = 24;
        return (
            <div>
                <div className="SoundEditor">

                    <div className="editor-countainer">
                        <div className="instrument-buttons">
                            {this.getInstrumentButtons()}
                        </div>
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
                    </div>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-around",
                            marginTop: "20px"
                        }}
                    >
                        <button className="button" onClick={() => this.state.currentMusic.play()} >Play</button>
                        <button className="button" onClick={() => this.clearMusic()} >Clear</button>
                        <button className="button" onClick={() => this.saveMusic()} >Save</button>
                    </div>
                </div>
            </div >
        )
    }

}
