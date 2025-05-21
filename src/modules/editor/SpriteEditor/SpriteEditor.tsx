import { WebrtcProvider } from "y-webrtc";
import { Doc } from "yjs";
import IEditor from "@modules/editor/IEditor";

import { SpriteSheet } from "@modules/editor/SpriteEditor/SpriteSheet";


export class SpriteEditor extends IEditor {
  private ydoc: Doc | null = null;
  private provider: WebrtcProvider | null = null;
  private spriteSheet: SpriteSheet;
  private currentColor: number = 0;

  constructor() {
    super();
    this.tabData = {
      title: "Sprite",
      icon: "sprite",
    };
    this.spriteSheet = new SpriteSheet();
  }

  public init(doc: Doc, provider: WebrtcProvider): void {
    this.ydoc = doc;
    this.provider = provider;
  }

  private handleClick(x: number, y: number): void {
    this.spriteSheet.draw(x, y, this.currentColor);
  }

  render() {
    return (
      <div />
    );
  }
}



