import IEditor from "../IEditor"; 


export class MapEditor extends IEditor {
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

export const MapEditorBalise = () => {
    return (
        <div>
            <p>Map Editor babage</p>
        </div>
    );
}
