import IEditor from "../IEditor";
import { TabData } from "@modules/editor/tab/TabData";

export class SpriteEditor extends IEditor {
    constructor() {
        super();
        this.tabData = {
            title: "Sprite",
            icon: "sprite",
        };
    }

    sendData(data: string) {
        console.log("SpriteEditor sendData", data);
    }

    loadData(data: string) {
        console.log("SpriteEditor loadData", data);
    }

    render() {
        return (
            <div>
                <p>Sprite Editor</p>
            </div>
        );
    }
}



