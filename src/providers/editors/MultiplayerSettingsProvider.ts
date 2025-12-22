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

type MultiplayerSettingsProviderVisitor = (settings: MultiplayerDirectorySettings, path: string) => void;

export class MultiplayerStateError extends Error {
  type = "MultiplayerStateError";

  constructor(message: string) {
    super(message);
  }
}

export class MultiplayerSettingsProvider {
  #yDirectory: Y.Map<MultiplayerDirectorySettings>;

  constructor(doc: Y.Doc) {
    this.#yDirectory = doc.getMap<MultiplayerDirectorySettings>("multiplayerDirectory");
  }

  public getDirectorySettings(path: string): Maybe<MultiplayerDirectorySettings> {
    // Root is an empty string
    if (path.length === 0 || path.trim().length === 0)
      path = "";

    const components = path.split(".");

    while (components.length > 0) {
      const pathToTest = components.join(".");

      if (this.#yDirectory.has(pathToTest)) {
        return this.#yDirectory.get(pathToTest);
      }

      components.pop();
    }

    return undefined;
  }

  public getRootDirectorySettings() : MultiplayerDirectorySettings {
    const rootSettings = this.#yDirectory.get("");

    if (!rootSettings) {
      throw new MultiplayerStateError("Unexpectedly missing root multiplayer directory settings");
    }

    return rootSettings;
  }

  public setDirectorySettings(path: string, settings: MultiplayerDirectorySettings): void {
    this.#yDirectory.set(path, settings);
  }

  public deleteDirectorySettings(path: string): void {
    this.#yDirectory.delete(path);
  }

  public visitDirectorySettings(visitor: MultiplayerSettingsProviderVisitor): void {
    this.#yDirectory.forEach(visitor);
  }

  public visitChildDirectorySettings(parentPath: string, visitor: MultiplayerSettingsProviderVisitor): void {
    const childVisitor: MultiplayerSettingsProviderVisitor = (settings, path) => {
      if (!path.startsWith(parentPath) || path === parentPath)
        return;

      visitor(settings, path);
    };

    this.visitDirectorySettings(childVisitor);
  }
}
