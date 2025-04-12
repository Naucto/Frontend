import IEditor from "../IEditor";
import { TabData } from "@modules/editor/tab/TabData";


export class MapEditor extends IEditor {
    constructor() {
        super();
        this.tabData = {
            title: "Map",
            icon: "map",
        };
    }

    sendData(data: string) {
        console.log("MapEditor sendData", data);
    }

    loadData(data: string) {
        console.log("MapEditor loadData", data);
    }

    render() {
        return (
            <div>
                <p>Map Editor</p>
            </div>
        );
    }

}

