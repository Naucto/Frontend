/** What the hub's pieces show of a game, under the names the API gives a game's fields. */
export interface HubGame {
  id: number;
  name: string;
  shortDesc: string;
  tags: readonly string[];
  viewCount: number;
  likes: number;
  creator: { id: number; username: string };
  coverUrl: string | null;
  /** A short silent recording of the game being played. */
  clipUrl: string | null;
  /** The disk's plastic, as any CSS colour; without one the disk keeps its own. */
  diskColor: string | null;
}

export interface SessionPlayer {
  id: number;
  username: string;
}

/** A game being played that still has room, or that the viewer is in. */
export interface HubSession {
  id: string;
  startedAt: string;
  hostId: number;
  players: readonly SessionPlayer[];
  /** How many it holds, players included. */
  capacity: number;
}
