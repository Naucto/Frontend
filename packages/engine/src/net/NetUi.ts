import type { SharedTableSession } from './SharedTableSession';

// Capacity (and an optional default title) are decided by the game, not the player.
export interface NetHostOptions {
  maxPlayers: number;
  title?: string;
  /** The room is in the browse list from the start, instead of reached by its code alone. */
  listed?: boolean;
}

/** The session a game was opened on, as `net.invite()` hands it to the game. */
export interface NetInvite {
  title: string;
  host: string;
  /** Seats taken, the host's included. */
  players: number;
  maxPlayers: number;
}

// Implemented app-side: the modal flow that creates/joins a session (REST +
// transport) and hands the engine the live SharedTableSession, or null on cancel.
export interface NetUi {
  host(options: NetHostOptions, onReady: (session: SharedTableSession | null) => void): void;
  join(onReady: (session: SharedTableSession | null) => void): void;
  leave(): void;
}
