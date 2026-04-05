import * as Y from "yjs";

export interface ProjectSettings {
  name: string;
  shortDesc: string;
  longDesc: string;
  iconUrl: string;
}

export type ProjectSettingsListener = (settings: ProjectSettings) => void;

export class ProjectSettingsProvider implements Destroyable {
  private readonly _projectNameContent: Y.Text;
  private readonly _shortDescContent: Y.Text;
  private readonly _longDescContent: Y.Text;
  private readonly _iconUrlContent: Y.Text;

  private _listeners = new Set<ProjectSettingsListener>();

  private readonly _boundCallListeners: () => void;

  constructor(ydoc: Y.Doc) {
    this._projectNameContent = ydoc.getText("projectName");
    this._shortDescContent = ydoc.getText("shortDescription");
    this._longDescContent = ydoc.getText("longDescription");
    this._iconUrlContent = ydoc.getText("iconUrl");
    this._boundCallListeners = this._callListeners.bind(this);
    this._projectNameContent.observe(this._boundCallListeners);
    this._shortDescContent.observe(this._boundCallListeners);
    this._longDescContent.observe(this._boundCallListeners);
    this._iconUrlContent.observe(this._boundCallListeners);
  }

  destroy(): void {
    this._listeners.clear();
    this._projectNameContent.unobserve(this._boundCallListeners);
    this._shortDescContent.unobserve(this._boundCallListeners);
    this._longDescContent.unobserve(this._boundCallListeners);
    this._iconUrlContent.unobserve(this._boundCallListeners);
  }

  private _callListeners(): void {
    this._listeners.forEach((callback) => callback(this.getSettings()));
  }

  public getSettings(): ProjectSettings {
    return {
      name: this._projectNameContent.toString(),
      shortDesc: this._shortDescContent.toString(),
      longDesc: this._longDescContent.toString(),
      iconUrl: this._iconUrlContent.toString(),
    };
  }

  public updateName(name: string): void {
    if (this._projectNameContent.toString() !== name) {
      this._projectNameContent.delete(0, this._projectNameContent.length);
      this._projectNameContent.insert(0, name);
    }
  }

  public updateShortDesc(shortDesc: string): void {
    if (this._shortDescContent.toString() !== shortDesc) {
      this._shortDescContent.delete(0, this._shortDescContent.length);
      this._shortDescContent.insert(0, shortDesc);
    }
  }

  public updateLongDesc(longDesc: string): void {
    if (this._longDescContent.toString() !== longDesc) {
      this._longDescContent.delete(0, this._longDescContent.length);
      this._longDescContent.insert(0, longDesc);
    }
  }

  public updateIconUrl(iconUrl: string): void {
    if (this._iconUrlContent.toString() !== iconUrl) {
      this._iconUrlContent.delete(0, this._iconUrlContent.length);
      this._iconUrlContent.insert(0, iconUrl);
    }
  }

  public observe(callback: ProjectSettingsListener): void {
    this._listeners.add(callback);
  }

  public unobserve(callback: ProjectSettingsListener): void {
    this._listeners.delete(callback);
  }
}
