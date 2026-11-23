export type SessionRole = 'host' | 'slave';

/**
 * Who a peer is inside a game session: the integer the server gives each connection, which the
 * game reads as `net.id()`, in `peer.joined` and `peer.left` and as the `from` of an event. Games
 * compute on it and compare it with `tonumber()`, so it stays an integer all the way into Lua.
 * It names a player at the game table and never an account: an account's id is an opaque string.
 */
export type PlayerNumber = number;

export interface RelayUsage {
  /** Whether our own end of the chosen pair holds a TURN allocation; only that end is billed. */
  relayed: boolean;
  bytesSent: number;
  bytesReceived: number;
}

// Frames are delivered identically whether they travelled a direct P2P data
// channel or the relay fallback, so SharedTableSession is unaware of the pipe.
export interface SessionTransportEvents {
  state: (data: unknown) => void;
  request: (from: PlayerNumber, data: unknown) => void;
  response: (data: unknown) => void;
  peerJoined: (player: PlayerNumber) => void;
  /** A peer already joined came back on a new connection, and may have missed what was sent. */
  peerRejoined: (player: PlayerNumber) => void;
  peerLeft: (player: PlayerNumber) => void;
  ended: () => void;
  connected: () => void;
  closed: () => void;
}

export interface SessionTransport {
  readonly role: SessionRole;
  readonly selfPlayer: PlayerNumber;

  broadcastState(data: unknown): void;
  respondTo(player: PlayerNumber, data: unknown): void;
  sendRequest(data: unknown): void;

  /**
   * Round-trip time to a peer in milliseconds, or null while it is unknown. Optional: transports
   * that cannot measure it (the in-memory test transport) simply omit it.
   */
  pingTo?(player: PlayerNumber): number | null;

  /** Optional for the same reason as `pingTo`: with no peer connection under it, nothing to measure. */
  relayUsage?(): RelayUsage[];

  on<E extends keyof SessionTransportEvents>(event: E, listener: SessionTransportEvents[E]): void;
  off<E extends keyof SessionTransportEvents>(event: E, listener: SessionTransportEvents[E]): void;

  destroy(): void;
}
