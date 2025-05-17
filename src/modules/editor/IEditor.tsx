import { TabData } from "@modules/editor/tab/TabData";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import React from "react";

abstract class IEditor extends React.Component {
  public tabData: TabData = new TabData("IEditor", "IEditor");

  public abstract init(doc: Y.Doc, provider: WebrtcProvider): void;
  
  render() {
    return <div />;
  }
}

export default IEditor;
