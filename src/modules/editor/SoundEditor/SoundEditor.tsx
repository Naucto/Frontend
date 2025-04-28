import IEditor from "@modules/editor/IEditor";
import { useTheme } from "@theme/ThemeContext"
import Music from "@modules/editor/SoundEditor/Music";
import "./SoundEditor.css"



interface SoundEditorState {
    currentMusic: Music;
    currentInstrument: string;
    activeCells: Set<string>;
}


export class SoundEditor extends IEditor {

    private _musics: Music[];
    private _instruments: string[] = [
        "flute",
        "piano",
        "guitar",
        "violin",
        "bassoon"]
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

    render() {
        //const theme = useTheme()
        const cellWidth = 35;
        const cellHeight = 20;
        const gridWidth = 32;
        const gridHeight = 24;
        return (




            <div
            /* style={{
                backgroundColor: theme.colors.background,
                color: theme.colors.text,
                fontFamily: theme.typography.fontFamily,
                fontSize: theme.typography.fontSize,
            }} */
            >
                <div className="SoundEditor">
                    <input
                        type="number"
                        min="0"
                        max={10 - 1}
                        value={1}

                    />
                    <div className="scrollable-container">

                        <div className="grid"
                            style={{
                                gridTemplateColumns: `repeat(${gridWidth}, ${cellWidth}px)`,
                                gridTemplateRows: `repeat(${gridHeight}, ${cellHeight}px)`,
                            }}
                        >
                            {[...Array(gridHeight)].map((_, row) =>
                                [...Array(gridWidth)].map((_, col) => {
                                    const cellKey = `${row}-${col}`;
                                    return (
                                        <div
                                            key={cellKey}
                                            onClick={() => {
                                                this.handleCellClick(row, col);
                                            }
                                            }
                                            style={{
                                                width: `${cellWidth}px`,
                                                height: `${cellHeight}px`,
                                                backgroundColor: this.state.activeCells.has(cellKey) ? "black" : "white",
                                                boxSizing: "border-box"
                                            }}
                                        ></div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-around",
                            marginTop: "20px"
                        }}
                    >
                        <button onClick={() => this.state.currentMusic.play()} >Play</button>
                        <button>load</button>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-around", marginTop: "20px" }}>
                        <div>
                            {this._instruments.map((instrument) => (
                                <button
                                    key={instrument}
                                    onClick={() => this.state.currentInstrument = instrument}
                                    style={{ margin: "5px", padding: "10px 15px" }}
                                >
                                    {instrument}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div >
        )
    }

}
