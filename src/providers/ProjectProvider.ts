import * as Y from "yjs";
import { LocalStorageManager } from "@utils/LocalStorageManager.ts";
import { ApiError, ProjectsService, WorkSessionsService } from "@api";
import { decodeUpdate, encodeUpdate } from "@utils/YSerialize.ts";
import { CodeProvider } from "./editors/CodeProvider.ts";
import { SpriteProvider } from "./editors/SpriteProvider.ts";
import { MapProvider } from "./editors/MapProvider.ts";
import { AwarenessProvider  } from "./editors/AwarenessProvider.ts";
import { WebrtcProvider } from "y-webrtc";
import config from "config.json";

export enum ProviderEventType {
  INITIALIZED,
  BECOME_HOST
}

export class ProjectProvider implements Destroyable {
  private _provider!: WebrtcProvider;
  private readonly _doc: Y.Doc;
  private _roomId: string | undefined;
  private _isKicking: boolean = false;
  private _initialized: boolean = false;

  private _listeners : Map<ProviderEventType, Set<() => void>> = new Map();

  public isHost: boolean;
  public code!: CodeProvider;
  public sprite!: SpriteProvider;
  public map!: MapProvider;
  public awareness!: AwarenessProvider;
  projectId: number;

  constructor(projectId: number) {
    this.projectId = projectId;
    this.isHost = false;
    this._doc = new Y.Doc();

    this.initializeDoc().then(() => {
      this._provider = new WebrtcProvider(this._roomId as string, this._doc, config.webrtc);

      this.awareness = new AwarenessProvider(this, this._provider);
      this.code = new CodeProvider(this._doc, this.awareness);
      this.sprite = new SpriteProvider(this._doc);
      this.map = new MapProvider(this._doc, { width:128, height:32 }, 2, this.sprite);

      this._initialized = true;
      this.emit(ProviderEventType.INITIALIZED);
    });
  }

  private async initializeDoc(): Promise<void> {
    try {
      const session = await WorkSessionsService.workSessionControllerJoin(this.projectId);
      this._roomId = session.roomId;

      const host = (await WorkSessionsService.workSessionControllerGetInfo(this.projectId)).host;
      const userId = LocalStorageManager.getUserId();
      this.isHost = host === userId;

      try {
        const content = await ProjectsService.projectControllerFetchProjectContent(String(this.projectId));
        if (content) {
          await decodeUpdate(this._doc, content);
        }
      } catch (error: unknown) {
        if (error instanceof ApiError && error.status === 404) {
          // FIXME new project: nothing to load; optionally could seed defaults here
          console.error("Failed to fetch project content:", error);
        } else {
          throw error;
        }
      }
    } catch (err) {
      console.error("Failed to join work session:", err); // FIXME : better error handling
    }
  }

  quit(): void {
    this.destroy();
  }

  destroy(): void {
    this.code.destroy();
    this.sprite.destroy();
    this.awareness.destroy();
    this._provider.disconnect();
    this._doc.destroy();
  }

  public async saveContent(): Promise<void> {
    if (!this.isHost)
      return;
    const data = encodeUpdate(this._doc);
    ProjectsService.projectControllerSaveProjectContent(
      String(this.projectId),
      { file: new Blob([data], { type: "application/octet-stream" }) }
    ).catch((error) => {
      console.error("Failed to save content:", error);
    });
  }

  public async checkAndKickDisconnectedUsers() : Promise<void> {
    if (this.isHost || this._isKicking || !this.awareness)
      return;

    this._isKicking = true;

    const userId = LocalStorageManager.getUserId();

    const projectId = Number(this.projectId);
    try {
      const sessionInfo = await WorkSessionsService.workSessionControllerGetInfo(projectId);

      if (!this.isHost && sessionInfo.host === Number(userId)) {
        this.isHost = true;
        this.emit(ProviderEventType.BECOME_HOST);
      }

      const connectedClients = Array.from(this.awareness?.getStates().keys() || []);
      if (
        connectedClients.length === 1 &&
        this.awareness?.getClientId() !== undefined &&
        connectedClients[0] === this.awareness?.getClientId()
      ) {
        for (const sessionUserId of sessionInfo.users) {
          if (Number(sessionUserId) !== userId) {
            await WorkSessionsService.workSessionControllerKick(projectId, {
              userId: Number(sessionUserId)
            });
          }
        }
        if (!this.isHost) {
          this.isHost = true;
          this.emit(ProviderEventType.BECOME_HOST);
        }
      }
    } catch (error) {
      console.error("Error checking or kicking disconnected users:", error);
    }

    this._isKicking = false;
  };

  public observe(event: ProviderEventType, callback: () => void): void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)?.add(callback);

    if (event === ProviderEventType.INITIALIZED && this._initialized) {
      callback();
    }

    if (event === ProviderEventType.BECOME_HOST && this.isHost) {
      callback();
    }
  }

  emit(event: ProviderEventType): void {
    this._listeners.get(event)?.forEach(callback => callback());
  }
}
