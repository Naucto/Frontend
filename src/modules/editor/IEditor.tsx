import { TabData } from "@modules/editor/tab/TabData";
import * as Y from "yjs"

abstract class IEditor {
  public tabData: TabData = new TabData("IEditor", "IEditor");

  public abstract init(doc: Y.Doc): void;
  
  render() {
    return <div />;
  }
}

export default IEditor;
