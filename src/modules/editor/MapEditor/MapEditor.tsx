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

  public getData(): string {
    // TODO
    return "";
  }

  public setData(data: string): void {
    // TODO
  }

  render() {
    return (
      <div>
        <p>Map Editor</p>
      </div>
    );
  }

}
