import { EngineUser } from "src/types/userTypes";
import { WebrtcProvider } from "y-webrtc";
import { Awareness } from "y-protocols/awareness";
import { generateRandomColor } from "@utils/colorUtils.ts";
import { LocalStorageManager } from "@utils/LocalStorageManager.ts";
import { EngineProvider, ProviderEventType } from "../EngineProvider.ts";
import { WorkSessionsService } from "@api";

export enum AwarenessEventType {
  CHANGE,
  UPDATE,
  DELETE,
  LOADED
}

export type AwarenessChangeListener = (changes: { added: number[], updated: number[], removed: number[] }) => void;

export class AwarenessProvider implements Disposable {
  private listeners : Map<AwarenessEventType, Set<AwarenessChangeListener>> = new Map();
  private userStateCache = new Map<number, EngineUser>();
  private provider: WebrtcProvider;
  private engine: EngineProvider;
  public loaded: boolean = false;

  constructor(engine: EngineProvider, provider: WebrtcProvider) {
    this.provider = provider;
    this.engine = engine;
    this.provider.awareness.on("change", (changes: { added: number[], updated: number[], removed: number[] }) => this._callListeners.bind(this, AwarenessEventType.CHANGE, changes));
    this.provider.awareness.on("update", (changes: { added: number[], updated: number[], removed: number[] }) => this._callListeners.bind(this, AwarenessEventType.UPDATE, changes));
    this.provider.awareness.on("delete", (changes: { added: number[], updated: number[], removed: number[] }) => this._callListeners.bind(this, AwarenessEventType.DELETE, changes));

    const userName = LocalStorageManager.getUserName();
    const userId = LocalStorageManager.getUserId();

    this.setLocalUser({
      name: userName,
      color: generateRandomColor(),
      userId: userId,
      clientId: provider.awareness.clientID
    });

    this.observe(AwarenessEventType.CHANGE, this._onChange.bind(this));
  }

  private _callListeners(event: AwarenessEventType, changes: { added: number[], updated: number[], removed: number[] }): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners?.forEach(l => l(changes));
    }
  }

  [Symbol.dispose](): void {
    this.provider.awareness.off("change", this._callListeners);
    this.provider.awareness.off("update", this._callListeners);
    this.provider.awareness.off("delete", this._callListeners);
    this.listeners.clear();
  }

  getAwareness(): Awareness {
    return this.provider.awareness;
  }

  getStates(): Map<number, unknown> {
    return this.provider.awareness.states;
  }

  getUserState(id: number): EngineUser {
    const data = this.provider.awareness.getStates().get(id);
    return {
      clientId: data?.clientId,
      userId: data?.userId,
      name: data?.name,
      color: data?.color
    };
  }

  getLocalUser(): EngineUser {
    const data = this.provider.awareness.getLocalState();
    return {
      clientId: data?.clientId,
      userId: data?.userId,
      name: data?.name,
      color: data?.color
    };
  }

  getClientId(): number {
    return this.provider.awareness.clientID;
  }

  setLocalUser(user: EngineUser): void {
    this.provider.awareness.setLocalStateField("clientId", user.clientId);
    this.provider.awareness.setLocalStateField("userId", user.userId);
    this.provider.awareness.setLocalStateField("name", user.name);
    this.provider.awareness.setLocalStateField("color", user.color);
  }

  observe(event: AwarenessEventType, callback: AwarenessChangeListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
  }

  count(): number {
    return this.provider.awareness.getStates().size;
  }

  private _onChange(changes: { added: number[], updated: number[], removed: number[] }): void {
    const userId = LocalStorageManager.getUserId();
    [...changes.added, ...changes.updated].forEach(clientID => {
      const state = this.getUserState(clientID);
      if (state) {
        this.userStateCache.set(clientID, state);
      }
    });

    changes.removed.forEach(clientID => {
      this.userStateCache.delete(clientID);
    });

    changes.removed.forEach(clientID => {
      const disconnectedUser = this.userStateCache.get(clientID);
      if (disconnectedUser) {
        const projectId = Number(LocalStorageManager.getProjectId());
        WorkSessionsService
          .workSessionControllerGetInfo(projectId)
          .then(sessionInfo => {
            if (sessionInfo.host === userId && !this.engine.isHost) {
              this.engine.isHost = true;
              this.engine.emit(ProviderEventType.BECOME_HOST);
            }
          });
        this.userStateCache.delete(clientID);

        WorkSessionsService.workSessionControllerKick(projectId, { userId: Number(disconnectedUser.userId) });

        this.engine.checkAndKickDisconnectedUsers();
      }
    });

    if (!this.loaded) {
      this.loaded = true;
      this._callListeners(AwarenessEventType.LOADED, { added: [], updated: [], removed: [] } );
    }
  }
}
