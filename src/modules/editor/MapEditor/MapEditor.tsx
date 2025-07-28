import IEditor from "@modules/editor/IEditor";
import { JSX } from "react";

export class MapEditor extends IEditor {
  constructor() {
    super();
    this.tabData = {
      title: "Map",
      icon: "map",
    };
  }

  public init(): void {

  }

  public getData(): string {
    // TODO
    return "";
  }

  public setData(): void {
    // TODO
  }

  render(): JSX.Element {
    return (
      <div>
        <p>Map Editor</p>
      </div>
    );
  }

}
