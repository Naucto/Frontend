import { NetHostOptions, NetUi } from "@engine/net/NetUi";
import { SharedTableSession } from "@engine/net/SharedTableSession";

export type NetUiRequestKind = "host" | "join";

export interface NetUiRequest {
  kind: NetUiRequestKind;
  hostOptions?: NetHostOptions;
  resolve: (session: SharedTableSession | null) => void;
}

// Bridges the engine's synchronous net.host()/net.join() calls to the async React
// modal flow. Engine-facing it is the NetUi port; React-facing it is an external
// store (subscribe/getSnapshot) consumed with useSyncExternalStore — no bespoke
// event bus.
export class NetUiBridge implements NetUi, Destroyable {
  private _request: NetUiRequest | null = null;
  private _active: SharedTableSession | null = null;
  private readonly _listeners = new Set<() => void>();

  destroy(): void {
    this._request?.resolve(null);
    this._active?.destroy();
    this._active = null;
    this._listeners.clear();
  }

  host(options: NetHostOptions, onReady: (session: SharedTableSession | null) => void): void {
    this._open("host", onReady, options);
  }

  join(onReady: (session: SharedTableSession | null) => void): void {
    this._open("join", onReady);
  }

  leave(): void {
    this._active?.destroy();
    this._active = null;
  }

  // Stable bound references so useSyncExternalStore doesn't resubscribe each render.
  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  getSnapshot = (): NetUiRequest | null => this._request;

  private _open(
    kind: NetUiRequestKind,
    onReady: (session: SharedTableSession | null) => void,
    hostOptions?: NetHostOptions,
  ): void {
    this._request = {
      kind,
      hostOptions,
      resolve: session => {
        this._request = null;

        if (session)
          this._active = session;

        this._notify();
        onReady(session);
      },
    };

    this._notify();
  }

  private _notify(): void {
    this._listeners.forEach(listener => listener());
  }
}
