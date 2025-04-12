import IEditor from "../IEditor"; 


class MapEditor extends IEditor {
    constructor() {
        super();
    }

    sendData(data: string) {
        console.log("MapEditor sendData", data);
    }

    loadData(data: string) {
        console.log("MapEditor loadData", data);
    }
}

export default MapEditor;