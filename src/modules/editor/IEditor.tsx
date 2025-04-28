
import {TabData} from "@modules/editor/tab/TabData";
import React from "react";

class IEditor extends React.Component {
    public tabData: TabData = new TabData("IEditor", "Ieditor");
    constructor() {
        super({});
    }
    render() {
        return <div></div>;
    }
}

export default IEditor;