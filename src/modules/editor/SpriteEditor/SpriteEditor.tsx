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

  screenSize = {
    width: 320,
    height: 180
  };

  spriteSheet: SpriteSheet = {
    spriteSheet: spriteTable,
    spriteSize: {
      width: 8,
      height: 8
    },
    size: {
      width: 128,
      height: 128,
    },
    stride: 1
  };

  public init(doc: Doc, provider: WebrtcProvider): void {
  }

  render() {
    return (
      <div>
        <StyledCanvas
          screenSize={this.screenSize}
          spriteSheet={this.spriteSheet}
          palette={palette}
        />
      </div>
    );
  }
}



