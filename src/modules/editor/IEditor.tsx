
import {TabData} from "@modules/editor/tab/TabData";

class IEditor {
    public tabData: TabData = new TabData("IEditor", "Ieditor");
    constructor() {}
    render() {
        return <div></div>;
    }
}

export default IEditor;