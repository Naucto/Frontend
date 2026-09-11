import type { InboundFrame } from './frames';
import type { SignalingSocketOptions } from './SessionSignalingSocket';
import { SessionSignalingSocket } from './SessionSignalingSocket';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;

  static last(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
  }

  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const make = (
  overrides: Partial<SignalingSocketOptions> = {},
): {
  frames: InboundFrame[];
  closed: boolean;
  socket: SessionSignalingSocket;
} => {
  const frames: InboundFrame[] = [];
  const state = { closed: false };

  const socket = new SessionSignalingSocket({
    url: 'ws://signal',
    ticket: 'ticket-1',
    ticketIssuedAt: Date.now(),
    refreshTicket: async () => null,
    onFrame: (frame) => frames.push(frame),
    onOpen: () => undefined,
    onClosed: () => {
      state.closed = true;
    },
    ...overrides,
  });

  return {
    frames,
    get closed(): boolean {
      return state.closed;
    },
    socket,
  };
};

describe('SessionSignalingSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  });

  it('connects with the ticket and routes inbound frames', () => {
    const { frames, socket } = make();

    expect(FakeWebSocket.last().url).toBe('ws://signal?ticket=ticket-1');

    FakeWebSocket.last().open();
    FakeWebSocket.last().receive({ type: 'state', data: { hp: 10 } });

    expect(frames).toEqual([{ type: 'state', data: { hp: 10 } }]);
    socket.destroy();
  });

  it('queues sends until open, then flushes them', () => {
    const { socket } = make();
    const ws = FakeWebSocket.last();

    socket.send({ type: 'request', data: 1 });
    expect(ws.sent).toEqual([]);

    ws.open();
    expect(JSON.parse(ws.sent[0]!)).toEqual({ type: 'request', data: 1 });
    socket.destroy();
  });

  it('treats session-ended as terminal', () => {
    const handle = make();
    FakeWebSocket.last().open();

    FakeWebSocket.last().receive({ type: 'session-ended' });

    expect(handle.frames).toContainEqual({ type: 'session-ended' });
    expect(handle.closed).toBe(true);
  });

  it('reconnects after an unexpected drop while the ticket is valid', () => {
    vi.useFakeTimers();
    const { socket } = make();
    FakeWebSocket.last().open();

    const before = FakeWebSocket.instances.length;
    FakeWebSocket.last().drop();
    vi.advanceTimersByTime(500);

    expect(FakeWebSocket.instances.length).toBe(before + 1);
    socket.destroy();
    vi.useRealTimers();
  });

  it('closes when the ticket cannot be refreshed past expiry', async () => {
    const refreshTicket = vi.fn().mockResolvedValue(null);
    const handle = make({ ticketIssuedAt: Date.now() - 60_000, refreshTicket });
    FakeWebSocket.last().open();

    FakeWebSocket.last().drop();
    await flushMicrotasks();

    expect(refreshTicket).toHaveBeenCalled();
    expect(handle.closed).toBe(true);
  });
});
