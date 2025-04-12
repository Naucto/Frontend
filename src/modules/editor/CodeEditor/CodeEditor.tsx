import IEditor from "../IEditor"; 
import { TabData } from "@modules/editor/tab/TabData";


export class CodeEditor extends IEditor {
    constructor() {
        super();
        this.tabData = {
            title: "Code",
            icon: "code",
        };
    }

    sendData(data: string) {
        console.log("CodeEditor sendData", data);
    }

    loadData(data: string) {
        console.log("CodeEditor loadData", data);
    }

    render() {
        return (
            <div>
                <p>Code Editor</p>
            </div>
        );
    }
}

