import { WebrtcProvider } from "y-webrtc";
import { Doc } from "yjs";
import IEditor from "@modules/editor/IEditor";


export class MapEditor extends IEditor {
  constructor() {
    super();
    this.tabData = {
      title: "Map",
      icon: "map",
    };
  }
    
  public init(doc: Doc, provider: WebrtcProvider): void {

  }

  render() {
    return (
      <div>
        <p>Map Editor</p>
      </div>
    );
  }

}
