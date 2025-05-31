import IEditor from "./IEditor";

class SpriteEditor extends IEditor {
  constructor() {
    super();
  }

  sendData(data: string) : void {
    console.log("SpriteEditor sendData", data);
  }

  loadData(data: string) : void {
    console.log("SpriteEditor loadData", data);
  }
}

export default SpriteEditor;
