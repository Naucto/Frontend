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

export class ProjectProvider implements Disposable {
  private provider: WebrtcProvider;
  private readonly doc: Y.Doc;
  private roomId: string | undefined;
  private isKicking: boolean = false;
  private init: boolean = false;

  private listeners : Map<ProviderEventType, Set<() => void>> = new Map();

  public isHost: boolean;
  public code: CodeProvider;
  public sprite: SpriteProvider;
  public map: MapProvider;
  public awareness: AwarenessProvider;
  projectId: number;

  constructor(projectId: number) {
    this.projectId = projectId;
    this.isHost = false;
    this.doc = new Y.Doc();

    this.initializeDoc().then(() => {
      this.provider = new WebrtcProvider(this.roomId as string, this.doc, config.webrtc);

      this.awareness = new AwarenessProvider(this, this.provider);
      this.code = new CodeProvider(this.doc, this.awareness);
      this.sprite = new SpriteProvider(this.doc);
      this.map = new MapProvider(this.doc, { width:128, height:32 }, 2, this.sprite);

      this.init = true;
      this.emit(ProviderEventType.INITIALIZED);
    });
  }

  private async initializeDoc(): Promise<void> {
    try {
      const session = await WorkSessionsService.workSessionControllerJoin(this.projectId);
      this.roomId = session.roomId;

      const host = (await WorkSessionsService.workSessionControllerGetInfo(this.projectId)).host;
      const userId = LocalStorageManager.getUserId();
      this.isHost = host === userId;

      try {
        const content = await ProjectsService.projectControllerFetchProjectContent(String(this.projectId));
        if (content) {
          await decodeUpdate(this.doc, content);
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
    this[Symbol.dispose]();
  }

  [Symbol.dispose](): void {
    this.code[Symbol.dispose]();
    this.sprite[Symbol.dispose]();
    this.awareness[Symbol.dispose]();
    this.provider.disconnect();
    this.doc.destroy();
  }

  public async saveContent(): Promise<void> {
    if (!this.isHost)
      return;
    const data = encodeUpdate(this.doc);
    ProjectsService.projectControllerSaveProjectContent(
      String(this.projectId),
      { file: new Blob([data], { type: "application/octet-stream" }) }
    ).catch((error) => {
      console.error("Failed to save content:", error);
    });
  }

  public async checkAndKickDisconnectedUsers() : Promise<void> {
    if (this.isHost || this.isKicking || !this.awareness)
      return;

    this.isKicking = true;

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

    this.isKicking = false;
  };

  public observe(event: ProviderEventType, callback: () => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);

    if (event === ProviderEventType.INITIALIZED && this.init) {
      callback();
    }

    if (event === ProviderEventType.BECOME_HOST && this.isHost) {
      callback();
    }
  }

  emit(event: ProviderEventType): void {
    this.listeners.get(event)?.forEach(callback => callback());
  }
}
