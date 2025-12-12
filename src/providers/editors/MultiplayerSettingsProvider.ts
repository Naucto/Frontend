import * as Y from "yjs";

export enum MultiplayerDirectoryFlags {
  NONE       = 0,
  READ_ONLY  = 1 << 0,
  WRITE_ONLY = 1 << 1
}

// Struct-like class
export class MultiplayerDirectorySettings {
  public clientFlags: MultiplayerDirectoryFlags = MultiplayerDirectoryFlags.NONE;
  public serverFlags: MultiplayerDirectoryFlags = MultiplayerDirectoryFlags.NONE;

  public isClientAllowed(flag: MultiplayerDirectoryFlags): boolean {
    return (this.clientFlags & flag) !== 0;
  }

  public isServerAllowed(flag: MultiplayerDirectoryFlags): boolean {
    return (this.serverFlags & flag) !== 0;
  }
}

export class MultiplayerSettingsProvider {
  private _directory: Y.Map<MultiplayerDirectorySettings>;

  constructor(doc: Y.Doc) {
    this._directory = doc.getMap<MultiplayerDirectorySettings>("multiplayerDirectory");
  }

  public getDirectorySettings(path: string): Maybe<MultiplayerDirectorySettings> {
    if (path.length === 0)
      return undefined;

    const components = path.split(".");

    while (components.length > 0) {
      const pathToTest = components.join(".");

      if (this._directory.has(pathToTest)) {
        return this._directory.get(pathToTest);
      }

      components.pop();
    }

    return undefined;
  }

  public setDirectorySettings(path: string, settings: MultiplayerDirectorySettings): void {
    this._directory.set(path, settings);
  }

  public deleteDirectorySettings(path: string): void {
    this._directory.delete(path);
  }
}
