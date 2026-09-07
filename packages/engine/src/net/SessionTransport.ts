export type SessionRole = 'host' | 'slave';

export type UserId = number;

// Frames are delivered identically whether they travelled a direct P2P data
// channel or the relay fallback, so SharedTableSession is unaware of the pipe.
export interface SessionTransportEvents {
  state: (data: unknown) => void;
  request: (from: UserId, data: unknown) => void;
  response: (data: unknown) => void;
  peerJoined: (userId: UserId) => void;
  peerLeft: (userId: UserId) => void;
  ended: () => void;
  connected: () => void;
  closed: () => void;
}

export interface SessionTransport {
  readonly role: SessionRole;
  readonly selfUserId: UserId;

  broadcastState(data: unknown): void;
  respondTo(userId: UserId, data: unknown): void;
  sendRequest(data: unknown): void;

  /**
   * Round-trip time to a peer in milliseconds, or null while it is unknown. Optional: transports
   * that cannot measure it (the in-memory test transport) simply omit it.
   */
  pingTo?(userId: UserId): number | null;

  on<E extends keyof SessionTransportEvents>(event: E, listener: SessionTransportEvents[E]): void;
  off<E extends keyof SessionTransportEvents>(event: E, listener: SessionTransportEvents[E]): void;

  destroy(): void;
}
