import IEditor from "../IEditor"; 


export class SpriteEditor extends IEditor {
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

export const SpriteEditorBalise = () => {
    return (
        <div>
            <p>Sprite Editor</p>
        </div>
    );
}


