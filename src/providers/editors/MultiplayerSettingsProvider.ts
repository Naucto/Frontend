import * as Y from "yjs";

export enum MultiplayerDirectoryFlags {
  NONE         = 0,

  CLIENT_READ  = 1 << 0,
  CLIENT_WRITE = 1 << 1,

  SERVER_READ  = 1 << 2,
  SERVER_WRITE = 1 << 3,
}

const ROOT_PATH = "";

// Struct-like data
type MultiplayerDirectoryData = {
  flags: MultiplayerDirectoryFlags;
};

export class MultiplayerDirectorySettings {
  private _path: string;
  private _data: MultiplayerDirectoryData;

  public constructor(path: string, data?: MultiplayerDirectoryData)
  {
    this._path = path;

    if (data) {
      this._data = data;
    } else {
      this._data = {
        flags: MultiplayerDirectoryFlags.NONE
      };
    }
  }

  public get path(): string {
    return this._path;
  }

  public get isRootNode(): boolean {
    return this._path == ROOT_PATH;
  }

  public get data(): MultiplayerDirectoryData {
    return this._data;
  }

  public can(flags: MultiplayerDirectoryFlags): boolean {
    return (this._data.flags & flags) === flags;
  }

  public set(flags: MultiplayerDirectoryFlags, value: boolean): void {
    if (value)
      this._data.flags |= flags;
    else
      this._data.flags &= ~flags;
  }
}

type MultiplayerSettingsProviderAccessor<T> =
  (settings: MultiplayerDirectorySettings) => Maybe<T>;

export class MultiplayerStateError extends Error {
  type = "MultiplayerStateError";

  constructor(message: string) {
    super(message);
  }
}

export class MultiplayerSettingsProvider {
  _yDirectory: Y.Map<MultiplayerDirectoryData>;

  constructor(doc: Y.Doc) {
    this._yDirectory = doc.getMap<MultiplayerDirectoryData>("multiplayerDirectory");
  }

  public getDirectorySettings(path: string): Maybe<MultiplayerDirectorySettings> {
    // Root is an empty string
    if (path.length === 0 || path.trim().length === 0)
      path = ROOT_PATH;

    const components = path.split(".");

    while (components.length > 0) {
      const pathToTest = components.join(".");

      if (this._yDirectory.has(pathToTest)) {
        return new MultiplayerDirectorySettings(
          pathToTest,
          this._yDirectory.get(pathToTest)
        );
      }

      components.pop();
    }

    return undefined;
  }

  public getRootDirectorySettings() : MultiplayerDirectorySettings {
    let rootSettings: MultiplayerDirectorySettings;
    const rootSettingsData = this._yDirectory.get(ROOT_PATH);

    if (rootSettingsData) {
      rootSettings = new MultiplayerDirectorySettings(ROOT_PATH, rootSettingsData);
    } else {
      rootSettings = new MultiplayerDirectorySettings(ROOT_PATH);
      this._yDirectory.set(ROOT_PATH, rootSettings.data);
    }

    return rootSettings;
  }

  public setDirectorySettings(path: string, settings: MultiplayerDirectorySettings): void {
    this._yDirectory.set(path, settings.data);
  }

  public createDirectorySettings(path: string): void {
    this.setDirectorySettings(path, new MultiplayerDirectorySettings(path));
  }

  public deleteDirectorySettings(path: string): void {
    this._yDirectory.delete(path);
  }

  public accessDirectorySettings<T>(path: string, accessor: MultiplayerSettingsProviderAccessor<T>): Maybe<T> {
    let settings = this.getDirectorySettings(path);

    if (!settings) {
      settings = new MultiplayerDirectorySettings(path);
    }

    const result = accessor(settings);

    this.setDirectorySettings(path, settings);

    return result;
  }

  public visitAllDirectorySettings<T>(accessor: MultiplayerSettingsProviderAccessor<T>): T[] {
    const results: T[] = [];

    const directoryKeys = Object.keys(this._yDirectory).sort();

    directoryKeys.forEach(
      (path) => {
        const settings = this._yDirectory.get(path);
        const result = accessor(
          new MultiplayerDirectorySettings(path, settings!),
        );

        if (result !== undefined)
          results.push(result);
      }
    );

    return results;
  }

  public visitChildDirectorySettings<T>(parentPath: string, accessor: MultiplayerSettingsProviderAccessor<T>): T[] {
    const childVisitor: MultiplayerSettingsProviderAccessor<T> = (settings) => {
      const calcPathDepth = (p: string): number => Number(p === ROOT_PATH) + p.split(".").length;

      const pathDepth       = calcPathDepth(settings.path);
      const parentPathDepth = calcPathDepth(parentPath);

      if (!settings.path.startsWith(parentPath) ||
          settings.path === parentPath ||
            pathDepth !== parentPathDepth + 1)
        return undefined;

      accessor(settings);
    };

    return this.visitAllDirectorySettings(childVisitor);
  }
}
