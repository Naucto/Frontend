export type PresenceKind = 'IDLE' | 'PLAYING' | 'BUILDING' | 'HOSTING';

/** What someone is doing right now, as the backend reports it over the user socket. */
export interface PresenceDto {
  userId: number;
  /** Who it is, so a presence row can name them without a second lookup. */
  username?: string;
  nickname?: string | null;
  kind: PresenceKind;
  releaseId?: number | null;
  projectId?: number | null;
  sessionId?: string | null;
  /** Name of the game being played, built or hosted. */
  title?: string | null;
  /** Cover of that game, so a presence row can show it. */
  coverUrl?: string | null;
  players?: number | null;
  maxPlayers?: number | null;
  joinable?: boolean;
  since: string;
}

/** What this client tells the server it is doing. */
export interface PresenceUpdate {
  kind: PresenceKind;
  releaseId?: number;
  projectId?: number;
  sessionId?: string;
}
