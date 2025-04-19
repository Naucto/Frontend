import { WebrtcProvider } from "y-webrtc";
import { Doc } from "yjs";
import IEditor from "../IEditor";

export class SpriteEditor extends IEditor {
  constructor() {
    super();
    this.tabData = {
      title: "Sprite",
      icon: "sprite",
    };
  }

  public init(doc: Doc, provider: WebrtcProvider): void {
  }

  render() {
    return (
      <div>
        <p>Sprite Editor</p>
      </div>
    );
  }
}



