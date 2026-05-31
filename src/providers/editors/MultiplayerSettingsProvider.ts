import * as Y from "yjs";
import { YMapEvent } from "yjs";

export enum MultiplayerDirectoryFlags {
  NONE         = 0,

  CLIENT_READ  = 1 << 0,
  CLIENT_WRITE = 1 << 1,

  SERVER_READ  = 1 << 2,
  SERVER_WRITE = 1 << 3,
}

const ROOT_PATH = "";
const ROOT_NAME = "<root>";

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

  public get name(): string {
    return this._path === ROOT_PATH ? ROOT_NAME : this._path.split(".").at(-1)!;
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

export type MultiplayerSettingsUpdateAction = "add" | "update" | "delete";
export type MultiplayerSettingsUpdateListener =
  (action: MultiplayerSettingsUpdateAction, directory: MultiplayerDirectorySettings) => void;

export class MultiplayerSettingsProvider implements Destroyable {
  private _yDoc: Y.Doc;
  private _yDirectory: Y.Map<MultiplayerDirectoryData>;

  private readonly _rootSettingsChangeListener: (e: YMapEvent<MultiplayerDirectoryData>) => void;
  private _boundSettingsChangeListeners = new Map<string, MultiplayerSettingsUpdateListener[]>();

  constructor(doc: Y.Doc) {
    this._yDoc = doc;
    this._yDirectory = this._yDoc.getMap<MultiplayerDirectoryData>("multiplayerDirectory");

    // Not a bug: this makes sure that the root node is always there
    this.getRootDirectorySettings();

    this._rootSettingsChangeListener = this.onSettingsChange.bind(this);
    this._yDirectory.observe(this._rootSettingsChangeListener);
  }

  destroy(): void {
    this._yDirectory.unobserve(this._rootSettingsChangeListener);
  }

  public isRootNodePath(path: string): boolean {
    return path.length === 0 || path.trim().length === 0;
  }

  public doesDirectorySettingsPathExist(path: string): boolean {
    return this._yDirectory.has(path);
  }

  public validateDirectorySettingsPath(path: string): boolean {
    if (path.length === 0)
      return true;

    // Path should be alphanumeric with dots, no consecutive dots, no leading/trailing dots
    const pathRegex = /^[a-z0-9]+(\.[a-z0-9]+)*$/i;
    return pathRegex.test(path);
  }

  public getDirectorySettings(path: string): Maybe<MultiplayerDirectorySettings> {
    // Root is an empty string
    if (this.isRootNodePath(path))
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

  public getPathDepth(path: string): number {
    return path.split(".").length - Number(path === ROOT_PATH);
  }

  public getParentNodePath(path: string): string {
    if (path.length === 0 || path.trim().length === 0)
      return path;

    const components = path.split(".");

    return components.slice(0, -1).join(".");
  }

  public getParentDirectorySettings(path: string): Maybe<MultiplayerDirectorySettings> {
    if (this.isRootNodePath(path))
      return undefined;

    const parentNodePath = this.getParentNodePath(path);
    return this.getDirectorySettings(parentNodePath);
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
    const components = path.split(".");

    while (components.length > 0) {
      const pathToMake = components.join(".");

      if (!this._yDirectory.has(pathToMake)) {
        const settings = new MultiplayerDirectorySettings(pathToMake);
        this._yDirectory.set(pathToMake, settings.data);
      }

      components.pop();
    }

    this._yDirectory.set(path, settings.data);
  }

  public createDirectorySettings(path: string): void {
    this.setDirectorySettings(path, new MultiplayerDirectorySettings(path));
  }

  public deleteDirectorySettings(path: string): void {
    this._yDirectory.delete(path);
  }

  public renameDirectorySettings(oldPath: string, newPath: string): void {
    if (oldPath === newPath) return;

    const data = this._yDirectory.get(oldPath);
    if (!data) return;

    this._yDoc.transact(() => {
      this._yDirectory.set(newPath, { ...data });
      this._yDirectory.delete(oldPath);

      const prefix = `${oldPath}.`;
      for (const key of this._yDirectory.keys()) {
        if (key.startsWith(prefix)) {
          const childData = this._yDirectory.get(key);
          const childNewPath = newPath + key.slice(oldPath.length);
          this._yDirectory.set(childNewPath, { ...childData! });
          this._yDirectory.delete(key);
        }
      }
    });
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

    const directoryKeys = [...this._yDirectory.keys()].sort();

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
      const pathDepth       = this.getPathDepth(settings.path);
      const parentPathDepth = this.getPathDepth(parentPath);

      if (
        !settings.path.startsWith(parentPath) ||
        settings.path === parentPath ||
        pathDepth !== parentPathDepth + 1
      )
        return undefined;

      accessor(settings);
    };

    return this.visitAllDirectorySettings(childVisitor);
  }

  // --------------------------------------------------------------------------

  public observe(path: string, callback: MultiplayerSettingsUpdateListener): void {
    let listeners = this._boundSettingsChangeListeners.get(path);

    if (!listeners)
      listeners = [];

    listeners.push(callback);
    this._boundSettingsChangeListeners.set(path, listeners);
  }

  public unobserve(path: string, callback?: MultiplayerSettingsUpdateListener): void {
    if (callback === undefined) {
      this._boundSettingsChangeListeners.delete(path);
      return;
    }

    const listeners = this._boundSettingsChangeListeners.get(path);

    if (!listeners)
      return;

    const filtered = listeners.filter(registeredCallback => registeredCallback !== callback);

    if (filtered.length === 0)
      this._boundSettingsChangeListeners.delete(path);
    else
      this._boundSettingsChangeListeners.set(path, filtered);
  }

  private onSettingsChange(event: Y.YMapEvent<MultiplayerDirectoryData>): void {
    event.changes.keys.forEach((change, nodePath) => {
      if (event.target !== this._yDirectory)
        return;

      const action = change.action;

      const callbacks       = this._boundSettingsChangeListeners.get(nodePath);
      const updatedSettings =
        action === "delete"
          ? new MultiplayerDirectorySettings(nodePath, change.oldValue)
          : this.getDirectorySettings(nodePath);

      if (callbacks)
        callbacks.forEach(c => c(action, updatedSettings!));

      const parentNodePath = this.getParentNodePath(nodePath);

      if (nodePath === parentNodePath)
        return;

      const parentCallbacks = this._boundSettingsChangeListeners.get(parentNodePath);

      if (parentCallbacks && nodePath !== parentNodePath)
        parentCallbacks.forEach(c => c(action, updatedSettings!));
    });
  }
}
