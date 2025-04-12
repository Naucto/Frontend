import IEditor from "../IEditor"; 


class CodeEditor extends IEditor {
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

export default CodeEditor;