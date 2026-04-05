import { LocalStorageManager } from "@utils/LocalStorageManager.ts";
import {
  projectControllerFetchProjectContent,
  projectControllerFindOne,
  projectControllerSaveProjectContent,
  projectControllerUpdate,
  WebRtcOfferDto,
  workSessionControllerGetInfo,
  workSessionControllerJoin,
  workSessionControllerKick
} from "@api";
import { decodeUpdate, encodeUpdate } from "@utils/YSerialize.ts";
import { CodeProvider } from "./editors/CodeProvider.ts";
import { SpriteProvider } from "./editors/SpriteProvider.ts";
import { MapProvider } from "./editors/MapProvider.ts";
import { AwarenessProvider } from "./editors/AwarenessProvider.ts";
import { ProjectSettingsProvider } from "./editors/ProjectSettingsProvider.ts";
import { MultiplayerSettingsProvider } from "./editors/MultiplayerSettingsProvider.ts";
import { SoundProvider } from "./editors/SoundProvider.ts";
import { ProviderOptions, WebrtcProvider } from "y-webrtc";

import * as Y from "yjs";
import { AxiosError } from "axios";

export enum ProviderEventType {
  INITIALIZED,
  BECOME_HOST
}

export class ProjectProvider implements Destroyable {
  private _yjsProvider!: WebrtcProvider;
  private readonly _yjsDoc: Y.Doc;

  private _roomId: string | undefined;
  private _isKicking: boolean = false;
  private _initialized: boolean = false;

  private _listeners: Map<ProviderEventType, Set<() => void>> = new Map();

  public isHost: boolean;

  public awarenessProvider!: AwarenessProvider;
  public codeProvider!: CodeProvider;
  public spriteProvider!: SpriteProvider;
  public mapProvider!: MapProvider;
  public multiplayerSettingsProvider!: MultiplayerSettingsProvider;

  public projectSettingsProvider!: ProjectSettingsProvider;
  public soundProvider!: SoundProvider;
  public projectId: number;

  constructor(projectId: number) {
    this.projectId = projectId;
    this.isHost = false;
    this._yjsDoc = new Y.Doc();

    this.initializeDoc().then((webrtcOffer?: WebRtcOfferDto) => {
      if (webrtcOffer === undefined) {
        console.log("Couldn't get WebRTC offer from server, cannot initialize");
        return;
      }

      this._yjsProvider = new WebrtcProvider(this._roomId as string, this._yjsDoc, webrtcOffer! as ProviderOptions);

      this.projectSettingsProvider     = new ProjectSettingsProvider(this._yjsDoc);
      this.awarenessProvider           = new AwarenessProvider(this, this._yjsProvider);
      this.codeProvider                = new CodeProvider(this._yjsDoc, this.awarenessProvider);
      this.spriteProvider              = new SpriteProvider(this._yjsDoc);
      this.mapProvider                 = new MapProvider(this._yjsDoc, { width:128, height:32 }, 2, this.spriteProvider);
      this.multiplayerSettingsProvider = new MultiplayerSettingsProvider(this._yjsDoc);
      this.soundProvider               = new SoundProvider(this._yjsDoc);

      this._initialized = true;
      this.emit(ProviderEventType.INITIALIZED);
    });
  }

  private async initializeDoc(): Promise<WebRtcOfferDto | undefined> {
    const isNotFoundError = (error: unknown): boolean =>
      (error as AxiosError)?.response?.status === 404;

    try {
      const { data: session } = await workSessionControllerJoin({
        path: { id: this.projectId }
      });

      console.log(`Joined work session ${session!.roomId} for project ID ${this.projectId}`);

      this._roomId = session!.roomId;

      const userId = LocalStorageManager.getUserId();
      this.isHost = session!.hostId === userId;

      const { data: projectContent } = await projectControllerFetchProjectContent({
        path: { id: String(this.projectId) }
      });

      console.log("Fetched project content");

      if (projectContent) {
        await decodeUpdate(this._yjsDoc, projectContent);

        console.log("Project content decoded successfully");
      } else {
        const { data: projectDetails } = (await projectControllerFindOne({
          path: { id: this.projectId }
        }));

        this.projectSettingsProvider.updateName(projectDetails!.name);
        this.projectSettingsProvider.updateShortDesc(projectDetails!.shortDesc);
        this.projectSettingsProvider.updateLongDesc(projectDetails!.longDesc ?? JSON.stringify(projectDetails!.longDesc));

        console.log("Project content initialized successfully");
      }

      return session!.webrtcOffer;
    } catch (error: unknown) {
      if (!isNotFoundError(error)) {
        throw error;
      }

      // FIXME: better error handling
      console.error("Failed to fetch project content:", error);

      return undefined;
    }
  }

  destroy(): void {
    this.codeProvider.destroy();
    this.spriteProvider.destroy();
    this.awarenessProvider.destroy();
    this.projectSettingsProvider.destroy();
    this.soundProvider.destroy();

    this._yjsProvider.disconnect();
    this._yjsDoc.destroy();
  }

  public async saveContent(): Promise<void> {
    if (!this.isHost)
      return;
    const data = encodeUpdate(this._yjsDoc);

    const details = (await projectControllerFindOne({ path: { id: this.projectId } })).data!;

    const settings = this.projectSettingsProvider.getSettings();

    if (details.name !== settings.name || (details.longDesc || "") !== settings.longDesc || details.shortDesc !== settings.shortDesc) {
      await projectControllerUpdate({
        path: { id: this.projectId },
        body: {
          name: settings.name,
          shortDesc: settings.shortDesc,
          longDesc: settings.longDesc as unknown as Record<string, unknown>,
        },
      });
    }

    projectControllerSaveProjectContent({
      path: { id: this.projectId },
      body: { file: new Blob([data], { type: "application/octet-stream" }) },
    }).catch((error) => {
      console.error("Failed to save content:", error);
    });
  }

  public async checkAndKickDisconnectedUsers() : Promise<void> {
    if (this.isHost || this._isKicking || !this.awarenessProvider)
      return;

    this._isKicking = true;

    const userId = LocalStorageManager.getUserId();

    const projectId = Number(this.projectId);
    try {
      const sessionInfo = (await workSessionControllerGetInfo({ path: { id: projectId } })).data!;

      if (!this.isHost && sessionInfo.hostId === userId) {
        this.isHost = true;
        this.emit(ProviderEventType.BECOME_HOST);
      }

      const connectedClients = Array.from(this.awarenessProvider?.getStates().keys() || []);
      if (
        connectedClients.length === 1 &&
        this.awarenessProvider?.getClientId() !== undefined &&
        connectedClients[0] === this.awarenessProvider?.getClientId()
      ) {
        const users = sessionInfo.users || [];
        for (const sessionUserId of users) {
          if (Number(sessionUserId) !== userId) {
            await workSessionControllerKick({ path: { id: projectId }, body: { userId: Number(sessionUserId) } });
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
