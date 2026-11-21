import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import type { Game } from '@naucto/engine';
import {
  type ConsoleEntry,
  Engine,
  type EngineError,
  type EngineFault,
  type EngineOptions,
  type EngineState,
  GamepadSource,
  KeyboardSource,
  SoundEngine,
  TouchSource,
  WebAudioBackend,
  WebGL2Backend,
} from '@naucto/engine';

import { CrashReporter } from '../../core/reports/crash-reporter.service';
import { GamepadSeatsStore } from '../controls/gamepad-seats.store';
import { ActiveRuntimeService } from './active-runtime.service';
import { faultError } from './fault-error';

/**
 * Owns one running game: engine, renderer, audio, input sources. Provided per
 * screen (component-level) so the editor and the play page each get their own. What a key or a
 * gamepad control does is the mounted game's to say: the engine reads it from the game's actions.
 * Which player a gamepad drives is the device's, the same for every game: `GamepadSeatsStore`.
 */
@Injectable()
export class RuntimeHostService {
  private engine: Engine | null = null;
  private readonly gamepad = signal<GamepadSource | null>(null);
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
  readonly frame = signal(0);
  /** The canvas the game is drawn on, at the console's own resolution; null until one is mounted. */
  readonly canvas = signal<HTMLCanvasElement | null>(null);

  private readonly active = inject(ActiveRuntimeService);
  private readonly crashes = inject(CrashReporter);
  private readonly seats = inject(GamepadSeatsStore);

  constructor() {
    effect(() => {
      const gamepad = this.gamepad();
      this.seats.seats().forEach((player, pad) => gamepad?.assign(pad, player));
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroy();
    });
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
    opts: Pick<EngineOptions, 'netUi' | 'netPermissions' | 'netInvite'> = {},
  ): Engine {
    this.destroy();
    this.canvas.set(canvas);
    this.gfx = new WebGL2Backend(canvas, game);
    this.audio = new WebAudioBackend();
    this.sound = new SoundEngine(this.audio, game);
    const gamepad = new GamepadSource();
    this.gamepad.set(gamepad);
    const engine = new Engine({
      game,
      gfx: this.gfx,
      sound: this.sound,
      inputs: [new KeyboardSource(), gamepad],
      inputTarget: canvas,
      ...opts,
    });
    this.engine = engine;
    this.active.claim(this);
    const reportFault = (fault: EngineFault): void => {
      const audio = this.audio?.contextState;
      this.crashes.report('engine', faultError(fault), {
        kind: fault.kind,
        ...(fault.phase ? { phase: fault.phase } : {}),
        ...(audio ? { audio } : {}),
      });
    };
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
      engine.onFault(reportFault),
      this.gfx.onFault(reportFault),
      this.audio.onFault(reportFault),
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
    this.canvas.set(null);
    this.active.release(this);
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
