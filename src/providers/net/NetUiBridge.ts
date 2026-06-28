import { NetUi } from "@engine/net/NetUi";
import { SharedTableSession } from "@engine/net/SharedTableSession";

export type NetUiRequestKind = "host" | "join";

export interface NetUiRequest {
  kind: NetUiRequestKind;
  resolve: (session: SharedTableSession | null) => void;
}

type RequestListener = (request: NetUiRequest | null) => void;

// Bridges the engine's synchronous net.host()/net.join() calls to the async React
// modal flow: the engine opens a request, React renders the matching modal and
// resolves it with a live session (or null on cancel).
export class NetUiBridge implements NetUi, Destroyable {
  private _request: NetUiRequest | null = null;
  private _active: SharedTableSession | null = null;
  private readonly _listeners = new Set<RequestListener>();

  destroy(): void {
    this._request?.resolve(null);
    this._active?.destroy();
    this._active = null;
    this._listeners.clear();
  }

  host(onReady: (session: SharedTableSession | null) => void): void {
    this._open("host", onReady);
  }

  join(onReady: (session: SharedTableSession | null) => void): void {
    this._open("join", onReady);
  }

  leave(): void {
    this._active?.destroy();
    this._active = null;
  }

  get request(): NetUiRequest | null {
    return this._request;
  }

  observe(listener: RequestListener): void {
    this._listeners.add(listener);
  }

  unobserve(listener: RequestListener): void {
    this._listeners.delete(listener);
  }

  private _open(kind: NetUiRequestKind, onReady: (session: SharedTableSession | null) => void): void {
    this._request = {
      kind,
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
    this._listeners.forEach(listener => listener(this._request));
  }
}
