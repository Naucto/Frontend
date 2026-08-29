import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import type { DeclaredAction, Game } from '@naucto/engine';
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
  WebAudioBackend,
  WebGL2Backend,
} from '@naucto/engine';

/**
 * Owns one running game: engine, renderer, audio, input sources. Provided per
 * screen (component-level) so the editor and the play page each get their own.
 */
@Injectable()
export class RuntimeHostService {
  private engine: Engine | null = null;
  private gfx: WebGL2Backend | null = null;
  private audio: WebAudioBackend | null = null;
  private sound: SoundEngine | null = null;
  private unsub: (() => void)[] = [];
  private perfTimer: ReturnType<typeof setInterval> | null = null;

  readonly state = signal<EngineState>('idle');
  readonly error = signal<EngineError | null>(null);
  readonly lines = signal<ConsoleEntry[]>([]);
  readonly fps = signal(0);
  readonly cpu = signal(0);
  /** Connected gamepads, polled with the frame stats; drives the P1/P2 chips in the transport. */
  readonly gamepadCount = signal(0);
  /** Action names the running game declared with `input.declare`. */
  readonly declaredActions = signal<readonly DeclaredAction[]>([]);
  readonly frame = signal(0);
  readonly ready = computed(() => this.engine !== null);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroy();
    });
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
    const keyboard = new KeyboardSource();
    const gamepad = new GamepadSource();
    const engine = new Engine({
      game,
      gfx: this.gfx,
      sound: this.sound,
      inputs: [keyboard, gamepad],
      onActionsDeclared: (actions) => {
        this.declaredActions.set(actions);
      },
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
    this.unsub.push(
      () => {
        canvas.removeEventListener('pointerdown', unlock);
        canvas.removeEventListener('keydown', unlock);
      },
      engine.onStateChange((s) => {
        this.state.set(s);
      }),
      engine.onError((e) => {
        this.error.set(e);
      }),
      engine.console.subscribe((ev) => {
        if (ev.type === 'clear') this.lines.set([]);
        else
          this.lines.update((l) =>
            l.length > 1999 ? [...l.slice(-1999), ev.entry] : [...l, ev.entry],
          );
      }),
    );
    this.perfTimer = setInterval(() => {
      this.fps.set(Math.round(engine.stats.fps));
      this.cpu.set(Math.round(engine.stats.cpu * 100));
      this.gamepadCount.set(
        typeof navigator.getGamepads === 'function'
          ? navigator.getGamepads().filter((p) => p !== null).length
          : 0,
      );
      this.frame.set(engine.stats.frame);
    }, 250);
    this.state.set('idle');
    this.error.set(null);
    this.lines.set([]);
    return engine;
  }

  play(): void {
    this.engine?.run();
  }
  pause(): void {
    this.engine?.pause();
  }
  resume(): void {
    this.engine?.resume();
  }
  restart(): void {
    const e = this.engine;
    if (!e) return;
    e.stop();
    e.run();
  }
  step(): void {
    this.engine?.stepOnce();
  }
  stop(): void {
    this.engine?.stop();
  }
  /** Reload code without losing the screen (editor auto-run). */
  reload(): void {
    const e = this.engine;
    if (!e) return;
    const wasRunning = e.currentState === 'running';
    e.stop();
    if (wasRunning) e.run();
  }
  screenshot(): Uint8ClampedArray | null {
    return this.engine?.screenshot() ?? null;
  }

  destroy(): void {
    if (this.perfTimer) clearInterval(this.perfTimer);
    this.perfTimer = null;
    for (const u of this.unsub) u();
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
