import IEditor from "@modules/editor/IEditor";
import { useTheme } from "@theme/ThemeContext"
import "./SoundEditor.css"

export class SoundEditor extends IEditor {
    constructor() {
        super();
    }

    sendData(data: string) {
        console.log("SoundEditor sendData", data);
    }

    loadData(data: string) {
        console.log("SoundEditor loadData", data);
    }
}

export const SoundEditorBalise = () => {
    const theme = useTheme()
    const editor = new SoundEditor();
    editor.sendData("test");
    const cellWidth = 35;
    const cellHeight = 20;
    const gridWidth = 32;
    const gridHeight = 16;
    console.log("", cellWidth);
    return (
        <div
            style={{
                backgroundColor: theme.colors.background,
                color: theme.colors.text,
                fontFamily: theme.typography.fontFamily,
                fontSize: theme.typography.fontSize,
            }}
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
                                        style={{
                                            width: `${cellWidth}px`,
                                            height: `${cellHeight}px`,
                                            backgroundColor: "white",
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
                    <button>Play</button>
                    <button>load</button>
                </div>
                <div style={{ display: "flex", justifyContent: "space-around", marginTop: "20px" }}>
                    <button style={{ width: "100px", height: "50px" }}>Flute</button>
                    <button style={{ width: "100px", height: "50px" }}>Piano</button>
                    <button style={{ width: "100px", height: "50px" }}>Guitar</button>
                    <button style={{ width: "100px", height: "50px" }}>Violin</button>
                    <button style={{ width: "100px", height: "50px" }}>Bassoon</button>
                </div>
            </div>
        </div>
    )
}