import { WebrtcProvider } from "y-webrtc";
import { Doc } from "yjs";
import IEditor from "@modules/editor/IEditor";
import { palette, spriteTable } from "src/temporary/SpriteSheet";
import { SpriteSheet } from "src/types/SpriteSheetType";
import StyledCanvas from "@shared/canvas/Canvas";

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
      <div />
    );
  }
}

