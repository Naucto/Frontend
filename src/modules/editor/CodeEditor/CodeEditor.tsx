import IEditor from "../IEditor"; 


export class CodeEditor extends IEditor {
    constructor() {
        super();
    }

    sendData(data: string) {
        console.log("CodeEditor sendData", data);
    }

    loadData(data: string) {
        console.log("CodeEditor loadData", data);
    }
}

export const CodeEditorBalise = () => {
    return (
        <div>
            <p>Code Editor</p>
        </div>
    );
}

