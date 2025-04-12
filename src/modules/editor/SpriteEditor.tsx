import IEditor from "./IEditor"; 


class SpriteEditor extends IEditor {
    constructor() {
        super();
    }

    sendData(data: string) {
        console.log("SpriteEditor sendData", data);
    }

    loadData(data: string) {
        console.log("SpriteEditor loadData", data);
    }
}

export default SpriteEditor;