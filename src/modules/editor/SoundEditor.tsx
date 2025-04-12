import IEditor from "./IEditor"; 


class SoundEditor extends IEditor {
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

export default SoundEditor;