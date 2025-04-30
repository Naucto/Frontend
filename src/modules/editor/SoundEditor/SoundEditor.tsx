import IEditor from "@modules/editor/IEditor";
import { useTheme } from "@theme/ThemeContext"
import Music from "@modules/editor/SoundEditor/Music";
import "./SoundEditor.css"
import { Doc } from "yjs";
import { WebrtcProvider } from "y-webrtc";



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

    componentWillUnmount() {
        console.log('SoundEditor unmounted');
    }

    componentDidMount() {
        console.log("✅ SoundEditor mounted!");
    }

    handleCellClick(row: number, col: number) {

        const cellKey = `${row}-${col}`;
        this.state.currentMusic.setNote(col, row, 1, this.state.currentInstrument);
        this.setState((prevState) => {
            const newActiveCells = new Set(prevState.activeCells);
            if (newActiveCells.has(cellKey)) {
                newActiveCells.delete(cellKey);
            } else {
                newActiveCells.add(cellKey);
            }
            return { activeCells: newActiveCells };
        });
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
                                                onClick={() => this.handleCellClick(row, col)}
                                                className={`cell ${isActive ? "selected" : ""}`}
                                                style={{
                                                    width: `${cellWidth}px`,
                                                    height: `${cellHeight}px`,
                                                    boxSizing: "border-box"
                                                }}
                                            ></div>
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
                        <button className="button">Save</button>
                    </div>
                </div>
            </div >
        )
    }

}
