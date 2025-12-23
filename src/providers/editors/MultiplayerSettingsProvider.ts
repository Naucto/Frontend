import * as Y from "yjs";

export enum MultiplayerDirectoryFlags {
  NONE         = 0,

  CLIENT_READ  = 1 << 0,
  CLIENT_WRITE = 1 << 1,

  SERVER_READ  = 1 << 2,
  SERVER_WRITE = 1 << 3,
}

// Struct-like class
export class MultiplayerDirectorySettings {
  public flags: MultiplayerDirectoryFlags = MultiplayerDirectoryFlags.NONE;

  public can(flags: MultiplayerDirectoryFlags): boolean {
    return (this.flags & flags) === flags;
  }

  public set(flags: MultiplayerDirectoryFlags, value: boolean): void {
    if (value)
      this.flags |= flags;
    else
      this.flags &= ~flags;
  }
}

type MultiplayerSettingsProviderAccessor<T> = (settings: MultiplayerDirectorySettings, path: string) => Maybe<T>;

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

  public accessDirectorySettings(path: string, accessor: MultiplayerSettingsProviderAccessor<void>): void {
    let settings = this.getDirectorySettings(path);

    if (!settings) {
      settings = new MultiplayerDirectorySettings();
    }

    accessor(settings, path);

    this.setDirectorySettings(path, settings);
  }

  public visitAllDirectorySettings<T>(accessor: MultiplayerSettingsProviderAccessor<T>): T[] {
    const results: T[] = [];

    const directoryKeys = Object.keys(this.#yDirectory).sort();

    directoryKeys.forEach(
      (key) => {
        const settings = this.#yDirectory.get(key);
        const result = accessor(settings!, key);

        if (result !== undefined)
          results.push(result);
      }
    );

    return results;
  }

  public visitChildDirectorySettings<T>(parentPath: string, accessor: MultiplayerSettingsProviderAccessor<T>): T[] {
    const childVisitor: MultiplayerSettingsProviderAccessor<T> = (settings, path) => {
      const calcPathDepth = (p: string): number => Number(p === "") + p.split(".").length;

      const pathDepth       = calcPathDepth(path);
      const parentPathDepth = calcPathDepth(parentPath);

      if (!path.startsWith(parentPath) || path === parentPath || pathDepth !== parentPathDepth + 1)
        return undefined;

      accessor(settings, path);
    };

    return this.visitAllDirectorySettings(childVisitor);
  }
}
