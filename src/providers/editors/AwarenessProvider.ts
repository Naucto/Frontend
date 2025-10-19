import { EngineUser } from "src/types/userTypes";
import { WebrtcProvider } from "y-webrtc";
import { Awareness } from "y-protocols/awareness";
import { generateRandomColor } from "@utils/colorUtils.ts";
import { LocalStorageManager } from "@utils/LocalStorageManager.ts";
import { ProjectProvider, ProviderEventType } from "../ProjectProvider";
import { WorkSessionsService } from "@api";

export enum AwarenessEventType {
  CHANGE,
  UPDATE,
  DELETE,
  LOADED
}

export type AwarenessChangeListener = (changes: { added: number[], updated: number[], removed: number[] }) => void;

export class AwarenessProvider implements Disposable {
  private _listeners : Map<AwarenessEventType, Set<AwarenessChangeListener>> = new Map();
  private _userStateCache = new Map<number, EngineUser>();
  private _provider: WebrtcProvider;
  private _engine: ProjectProvider;
  public loaded: boolean = false;

  private changeListener: AwarenessChangeListener;
  private updateListener: AwarenessChangeListener;
  private deleteListener: AwarenessChangeListener;

  constructor(engine: ProjectProvider, provider: WebrtcProvider) {
    this._provider = provider;
    this._engine = engine;

    this.changeListener = (changes: { added: number[], updated: number[], removed: number[] }) => {
      this._callListeners(AwarenessEventType.CHANGE, changes);
    };
    this.updateListener = (changes: { added: number[], updated: number[], removed: number[] }) => {
      this._callListeners(AwarenessEventType.UPDATE, changes);
    };
    this.deleteListener = (changes: { added: number[], updated: number[], removed: number[] }) => {
      this._callListeners(AwarenessEventType.DELETE, changes);
    };

    this._provider.awareness.on("change", this.changeListener.bind(this));
    this._provider.awareness.on("update", this.updateListener.bind(this));
    this._provider.awareness.on("delete", this.deleteListener.bind(this));

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
    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners?.forEach(listener => listener(changes));
    }
  }

  [Symbol.dispose](): void {
    this._provider.awareness.off("change", this.changeListener.bind(this));
    this._provider.awareness.off("update", this.updateListener.bind(this));
    this._provider.awareness.off("delete", this.deleteListener.bind(this));
    this._listeners.clear();
  }

  getAwareness(): Awareness {
    return this._provider.awareness;
  }

  getStates(): Map<number, unknown> {
    return this._provider.awareness.states;
  }

  getUserState(id: number): EngineUser {
    const data = this._provider.awareness.getStates().get(id);
    return {
      clientId: data?.clientId,
      userId: data?.userId,
      name: data?.name,
      color: data?.color
    };
  }

  getLocalUser(): EngineUser {
    const data = this._provider.awareness.getLocalState();
    return {
      clientId: data?.clientId,
      userId: data?.userId,
      name: data?.name,
      color: data?.color
    };
  }

  getClientId(): number {
    return this._provider.awareness.clientID;
  }

  setLocalUser(user: EngineUser): void {
    this._provider.awareness.setLocalStateField("clientId", user.clientId);
    this._provider.awareness.setLocalStateField("userId", user.userId);
    this._provider.awareness.setLocalStateField("name", user.name);
    this._provider.awareness.setLocalStateField("color", user.color);
  }

  observe(event: AwarenessEventType, callback: AwarenessChangeListener): void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)?.add(callback);
  }

  count(): number {
    return this._provider.awareness.getStates().size;
  }

  private _onChange(changes: { added: number[], updated: number[], removed: number[] }): void {
    const userId = LocalStorageManager.getUserId();
    [...changes.added, ...changes.updated].forEach(clientID => {
      const state = this.getUserState(clientID);
      if (state) {
        this._userStateCache.set(clientID, state);
      }
    });

    changes.removed.forEach(clientID => {
      this._userStateCache.delete(clientID);
    });

    changes.removed.forEach(clientID => {
      const disconnectedUser = this._userStateCache.get(clientID);
      if (disconnectedUser) {
        const projectId = Number(this._engine.projectId);
        WorkSessionsService
          .workSessionControllerGetInfo(projectId)
          .then(sessionInfo => {
            if (sessionInfo.host === userId && !this._engine.isHost) {
              this._engine.isHost = true;
              this._engine.emit(ProviderEventType.BECOME_HOST);
            }
          });
        this._userStateCache.delete(clientID);
        WorkSessionsService.workSessionControllerKick(projectId, { userId: Number(disconnectedUser.userId) });

        this._engine.checkAndKickDisconnectedUsers();
      }
    });

    if (!this.loaded) {
      this.loaded = true;
      this._callListeners(AwarenessEventType.LOADED, { added: [], updated: [], removed: [] } );
    }
  }

  getUsers(): EngineUser[] {
    return Array.from(this._userStateCache.values());
  }
}
