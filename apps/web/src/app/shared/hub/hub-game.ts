import type { DiskStyle } from '../game-card/disk-style';

/** What the hub's pieces show of a game, under the names the API gives a game's fields. */
export interface HubGame {
  id: number;
  name: string;
  shortDesc: string;
  tags: readonly string[];
  viewCount: number;
  likes: number;
  commentCount?: number;
  creator: { id: number; username: string };
  coverUrl: string | null;
  /** A short silent recording of the game being played. */
  clipUrl?: string | null;
  /** How its author dressed the disk; without it the disk keeps a plastic of its own. */
  disk?: DiskStyle | null;
}

export interface SessionPlayer {
  username: string;
  /** What they are called, when it is not their username. */
  nickname?: string;
}

/** A game being played that still has room, or that the viewer is in. */
export interface HubSession {
  sessionUuid: string;
  startedAt: string;
  projectId: number;
  projectName: string;
  coverUrl: string | null;
  hostUsername: string;
  /** Who is in, host first; a crowded session names only its first players. */
  roster: readonly SessionPlayer[];
  playerCount: number;
  /** How many it holds, players included. */
  maxPlayers: number;
}
