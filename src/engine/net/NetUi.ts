import { SharedTableSession } from "./SharedTableSession";

// Capacity (and an optional default title) are decided by the game, not the player.
export interface NetHostOptions {
  maxPlayers: number;
  title?: string;
}

// Implemented app-side: the modal flow that creates/joins a session (REST +
// transport) and hands the engine the live SharedTableSession, or null on cancel.
export interface NetUi {
  host(options: NetHostOptions, onReady: (session: SharedTableSession | null) => void): void;
  join(onReady: (session: SharedTableSession | null) => void): void;
  leave(): void;
}
