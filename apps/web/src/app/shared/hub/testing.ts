import type { HubGame, HubSession } from './hub-game';

/** A game for the specs of the hub's pieces: every field set, and told apart by its number. */
export function gameOf(id: number, over: Partial<HubGame> = {}): HubGame {
  return {
    id,
    name: `Game ${String(id)}`,
    shortDesc: `What game ${String(id)} is.`,
    tags: ['arcade'],
    viewCount: 1000 * id,
    likes: 10 * id,
    commentCount: id,
    creator: { id: 100 + id, username: `maker${String(id)}` },
    coverUrl: `/covers/${String(id)}.png`,
    clipUrl: null,
    disk: null,
    ...over,
  };
}

/** A session of `player1`…, hosted by the first, naming eight of them at most as the API does. */
export function sessionOf(
  seated: number,
  seats: number,
  over: Partial<HubSession> = {},
): HubSession {
  return {
    sessionUuid: 'room',
    startedAt: '2026-11-20T10:00:00Z',
    projectId: 7,
    projectName: 'Game 7',
    coverUrl: null,
    hostUsername: 'player1',
    roster: Array.from({ length: Math.min(seated, 8) }, (_, i) => ({
      id: i + 1,
      username: `player${String(i + 1)}`,
    })),
    playerCount: seated,
    maxPlayers: seats,
    ...over,
  };
}

/** jsdom lays nothing out and has no pointer capture; the pieces only ask them when to measure. */
export function installLayoutStubs(): void {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe(): void {
      return undefined;
    }
    disconnect(): void {
      return undefined;
    }
  };
  HTMLElement.prototype.setPointerCapture = (): void => undefined;
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
}

/** A pointer event as jsdom can make one: a mouse event that says what kind of pointer it is. */
export function pointer(
  target: Element,
  type: string,
  pointerType: string,
  at: { x?: number; y?: number; time?: number } = {},
): void {
  const event = new MouseEvent(type, { bubbles: true, clientX: at.x ?? 0, clientY: at.y ?? 0 });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  Object.defineProperty(event, 'timeStamp', { value: at.time ?? 0 });
  target.dispatchEvent(event);
}
