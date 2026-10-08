import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import type { Game } from '@naucto/engine';
import {
  type ConsoleEntry,
  Engine,
  type EngineError,
  type EngineState,
  GamepadSource,
  KeyboardSource,
  type NetPermissions,
  type NetUi,
  SoundEngine,
  TouchSource,
  WebAudioBackend,
  WebGL2Backend,
} from '@naucto/engine';

import { InputBindingsStore } from '../../core/input/input-bindings.store';

/**
 * Owns one running game: engine, renderer, audio, input sources. Provided per
 * screen (component-level) so the editor and the play page each get their own.
 */
@Injectable()
export class RuntimeHostService {
  private engine: Engine | null = null;
  private keyboard: KeyboardSource | null = null;
  private gamepad: GamepadSource | null = null;
  private gfx: WebGL2Backend | null = null;
  private audio: WebAudioBackend | null = null;
  private sound: SoundEngine | null = null;
  private unsub: (() => void)[] = [];
  private perfTimer: ReturnType<typeof setInterval> | null = null;
  private readonly stateListeners = new Set<(state: EngineState) => void>();

  readonly state = signal<EngineState>('idle');
  readonly error = signal<EngineError | null>(null);
  readonly lines = signal<ConsoleEntry[]>([]);
  readonly fps = signal(0);
  readonly cpu = signal(0);
  /** Connected gamepads, polled with the frame stats. */
  readonly gamepadCount = signal(0);
  readonly frame = signal(0);

  private readonly bindings = inject(InputBindingsStore);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroy();
    });
    effect(() => {
      const allBindings = this.bindings.bindings();
      this.keyboard?.setBindings(allBindings);
      this.gamepad?.setBindings(allBindings);
    });
  }

  /** Connected gamepads and the player slot each one drives. */
  gamepads(): { index: number; id: string; player: number }[] {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const out: { index: number; id: string; player: number }[] = [];
    pads.forEach((pad, i) => {
      if (pad) {
        out.push({ index: i, id: pad.id, player: this.gamepad?.slots[i] ?? i });
      }
    });
    return out;
  }

  assignGamepad(index: number, player: number): void {
    this.gamepad?.assign(index, player);
  }

  /**
   * Adds the on-screen pad as a third source. Kept out of `mount` because the pad's element only
   * exists while the pad is rendered, and the same runtime outlives an orientation change.
   */
  attachPad(root: HTMLElement): () => void {
    const engine = this.engine;
    if (!engine) {
      return () => undefined;
    }
    const source = new TouchSource(root);
    engine.addInputSource(source);
    return () => {
      engine.removeInputSource(source);
    };
  }

  /** Creates the runtime on a canvas. Safe to call again with a new game (tears the previous one down). */
  mount(
    canvas: HTMLCanvasElement,
    game: Game,
    opts: { netUi?: NetUi; netPermissions?: NetPermissions } = {},
  ): Engine {
    this.destroy();
    this.gfx = new WebGL2Backend(canvas, game);
    this.audio = new WebAudioBackend();
    this.sound = new SoundEngine(this.audio, game);
    const keyboard = new KeyboardSource({ bindings: this.bindings.bindings() });
    const gamepad = new GamepadSource({ bindings: this.bindings.bindings() });
    this.keyboard = keyboard;
    this.gamepad = gamepad;
    const engine = new Engine({
      game,
      gfx: this.gfx,
      sound: this.sound,
      inputs: [keyboard, gamepad],
      inputTarget: canvas,
      netUi: opts.netUi,
      netPermissions: opts.netPermissions,
    });
    this.engine = engine;
    const unlock = (): void => {
      void this.audio?.unlock();
    };
    canvas.addEventListener('pointerdown', unlock);
    canvas.addEventListener('keydown', unlock);
    // A hidden tab gets no animation frames but its audio graph keeps running, so pause while
    // hidden and resume on return — unless the game was already paused.
    let pausedByVisibility = false;
    const onVisibility = (): void => {
      if (document.hidden) {
        if (engine.currentState === 'running') {
          engine.pause();
          pausedByVisibility = true;
        }
      } else if (pausedByVisibility) {
        pausedByVisibility = false;
        engine.resume();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.unsub.push(
      () => {
        canvas.removeEventListener('pointerdown', unlock);
        canvas.removeEventListener('keydown', unlock);
        document.removeEventListener('visibilitychange', onVisibility);
      },
      engine.onStateChange((nextState) => {
        this.setState(nextState);
        if (nextState === 'running') {
          this.error.set(null);
        }
      }),
      engine.onError((error) => {
        this.error.set(error);
      }),
      engine.console.subscribe((ev) => {
        if (ev.type === 'clear') {
          this.lines.set([]);
        } else {
          this.lines.update((current) =>
            current.length > 1999 ? [...current.slice(-1999), ev.entry] : [...current, ev.entry],
          );
        }
      }),
    );
    this.perfTimer = setInterval(() => {
      this.fps.set(Math.round(engine.stats.fps));
      this.cpu.set(Math.round(engine.stats.cpu * 100));
      this.gamepadCount.set(
        typeof navigator.getGamepads === 'function'
          ? navigator.getGamepads().filter((pad) => pad !== null).length
          : 0,
      );
      this.frame.set(engine.stats.frame);
    }, 250);
    this.setState('idle');
    this.error.set(null);
    this.lines.set([]);
    return engine;
  }

  /**
   * Every state change, as it happens. A restart passes through `idle` within one call, which the
   * `state` signal never shows.
   */
  onStateChange(listener: (state: EngineState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Unlocks audio first: the click that starts a game lands on a control outside the canvas, where
   * the canvas's own unlock listeners never see it.
   */
  play(): void {
    void this.audio?.unlock();
    this.engine?.run();
  }
  pause(): void {
    this.engine?.pause();
  }
  resume(): void {
    void this.audio?.unlock();
    this.engine?.resume();
  }
  restart(): void {
    const engine = this.engine;
    if (!engine) {
      return;
    }
    void this.audio?.unlock();
    engine.stop();
    engine.run();
  }
  step(): void {
    this.engine?.stepOnce();
  }
  /**
   * Reload code without losing the screen (editor auto-run). A game nobody started stays that way;
   * a running or halted one runs the new code; a paused one gets it loaded and stays paused.
   */
  reload(): void {
    const engine = this.engine;
    if (!engine) {
      return;
    }
    const was = engine.currentState;
    if (was === 'idle') {
      return;
    }
    engine.stop();
    if (was === 'paused') {
      engine.load({ hold: true });
    } else {
      engine.run();
    }
  }
  screenshot(): Uint8ClampedArray | null {
    return this.engine?.screenshot() ?? null;
  }

  private setState(next: EngineState): void {
    this.state.set(next);
    for (const listener of this.stateListeners) {
      listener(next);
    }
  }

  destroy(): void {
    if (this.perfTimer) {
      clearInterval(this.perfTimer);
    }
    this.perfTimer = null;
    for (const unsubscribe of this.unsub) {
      unsubscribe();
    }
    this.unsub = [];
    this.engine?.destroy();
    this.engine = null;
    this.sound?.destroy();
    this.sound = null;
    this.audio?.destroy();
    this.audio = null;
    this.gfx?.destroy();
    this.gfx = null;
  }
}
