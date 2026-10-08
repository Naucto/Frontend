import { type PresenceDto, type PresenceKind } from '@naucto/api-client';
import { formatElapsed } from '@naucto/ui';

/** How a presence reads, as Transloco keys, so every surface words it the same way. */
export interface PresenceLine {
  /** The verb alone, before the game: "playing", "hosting". */
  verbKey: string;
  /** The verb after a person's name: "is in", "hosts". */
  clauseKey: string;
  /** The game, kept apart from the verb because rows tint it. */
  name: string;
  /** What follows the game, if anything: the elapsed time, the seats, the call for collaborators. */
  tail: { key: string; params: Record<string, unknown> } | null;
}

/** IDLE says nothing, so there is no line to show. */
const PHRASES: Record<
  PresenceKind,
  {
    verbKey: string;
    clauseKey: string;
    tail: (presence: PresenceDto) => PresenceLine['tail'];
  } | null
> = {
  IDLE: null,
  PLAYING: {
    verbKey: 'presence.playing',
    clauseKey: 'presence.isIn',
    tail: (presence) => ({
      key: 'presence.elapsed',
      params: { when: formatElapsed(presence.since) },
    }),
  },
  BUILDING: {
    verbKey: 'presence.building',
    clauseKey: 'presence.isBuilding',
    tail: (presence) => (presence.joinable ? { key: 'presence.openToCollab', params: {} } : null),
  },
  HOSTING: {
    verbKey: 'presence.hosting',
    clauseKey: 'presence.hosts',
    tail: (presence) => ({
      key: 'presence.players',
      params: { n: presence.players ?? 0, m: presence.maxPlayers ?? 0 },
    }),
  },
};

export function presenceLine(presence: PresenceDto | null | undefined): PresenceLine | null {
  const phrase = presence ? PHRASES[presence.kind] : null;
  if (!presence || !phrase) {
    return null;
  }
  return {
    verbKey: phrase.verbKey,
    clauseKey: phrase.clauseKey,
    name: presence.title ?? '',
    tail: phrase.tail(presence),
  };
}
