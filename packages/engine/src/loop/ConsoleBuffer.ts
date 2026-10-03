import type { ConsoleLevel } from '../api/ports';

export interface ConsoleEntry {
  id: number;
  level: ConsoleLevel;
  text: string;
  frame: number;
  time: number;
}

export type ConsoleEvent = { type: 'append'; entry: ConsoleEntry } | { type: 'clear' };

/** The most recent console lines, capped, with a subscribe() stream of appends and clears. */
export class ConsoleBuffer {
  private readonly entries: ConsoleEntry[] = [];
  private readonly listeners = new Set<(event: ConsoleEvent) => void>();
  private seq = 0;

  constructor(
    private readonly capacity = 500,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get lines(): readonly ConsoleEntry[] {
    return this.entries;
  }

  append(level: ConsoleLevel, text: string, frame: number): ConsoleEntry {
    const entry: ConsoleEntry = { id: ++this.seq, level, text, frame, time: this.now() };
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
    this.listeners.forEach((listener) => {
      listener({ type: 'append', entry });
    });
    return entry;
  }

  clear(): void {
    this.entries.length = 0;
    this.listeners.forEach((listener) => {
      listener({ type: 'clear' });
    });
  }

  subscribe(listener: (event: ConsoleEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
