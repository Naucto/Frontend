import type { ApiContext } from '../api/ApiContext';
import { buildCompatPrelude } from '../api/compatPrelude';
import type { EngineModule } from '../api/EngineModule';
import { GfxAPI } from '../api/GfxAPI';
import { InputAPI } from '../api/InputAPI';
import { MapAPI } from '../api/MapAPI';
import { NetAPI } from '../api/NetAPI';
import type { ConsoleLevel, GfxBackend, SoundPort } from '../api/ports';
import { SoundAPI } from '../api/SoundAPI';
import { SysAPI } from '../api/SysAPI';
import type { Game } from '../game/Game';
import { MAP_WIDTH } from '../game/keys';
import type { DeclaredAction } from '../input/ActionMap';
import type { InputSource } from '../input/InputSource';
import { InputState } from '../input/InputState';
import { ConsoleBuffer } from '../loop/ConsoleBuffer';
import { GameLoop, type LoopDriver, STEP_MS } from '../loop/GameLoop';
import { Stats } from '../loop/Stats';
import type { NetPermissions } from '../net/NetPermissions';
import type { NetUi } from '../net/NetUi';
import type { SharedTableSession } from '../net/SharedTableSession';
import { LuaEnvironment, LuaError } from '../vm/LuaEnvironment';
import type { EngineError, EnginePhase } from './EngineError';

export type EngineState = 'idle' | 'running' | 'paused' | 'halted';

export interface EngineOptions {
  game: Game;
  gfx: GfxBackend;
  sound?: SoundPort;
  inputs?: InputSource[];
  /** Element that receives keyboard/mouse focus (the canvas). */
  inputTarget?: HTMLElement;
  netUi?: NetUi;
  /** Called when the game declares its action map, so the app can persist and display it. */
  onActionsDeclared?: (actions: readonly DeclaredAction[]) => void;
  netPermissions?: NetPermissions;
  driver?: LoopDriver;
  consoleCapacity?: number;
}

/**
 * Runs one game: owns the Lua VM, the API modules, the fixed-step loop, the
 * console and the input snapshot. The app creates one Engine per game screen.
 */
export class Engine {
  readonly console: ConsoleBuffer;
  readonly stats = new Stats();
  readonly input = new InputState();
  /** Attached input devices; sources may be added or removed while the game runs. */
  private readonly sources = new Set<InputSource>();
  /** Action names declared by the running game, empty until it calls `input.declare`. */
  declaredActions: readonly DeclaredAction[] = [];

  private lua: LuaEnvironment | null = null;
  private modules: EngineModule[] = [];
  private netApi: NetAPI | null = null;
  private readonly loop: GameLoop;
  private state: EngineState = 'idle';
  private elapsed = 0;
  private readonly tileOverrides = new Map<number, number>();
  private readonly errorListeners = new Set<(e: EngineError) => void>();
  private readonly stateListeners = new Set<(s: EngineState) => void>();
  private lastError: EngineError | null = null;

  constructor(private readonly opts: EngineOptions) {
    this.console = new ConsoleBuffer(opts.consoleCapacity ?? 500);
    this.loop = new GameLoop(
      () => this.step(),
      () => {
        this.present();
      },
      opts.driver,
    );
    for (const src of opts.inputs ?? []) this.sources.add(src);
    for (const src of this.sources) src.attach(opts.inputTarget ?? null, this.input);
  }

  /**
   * Plug in a source after construction — a pad that appears on rotate, a second gamepad — without
   * remounting the engine. Attaching twice is a no-op.
   */
  addInputSource(source: InputSource): void {
    if (this.sources.has(source)) return;
    this.sources.add(source);
    source.attach(this.opts.inputTarget ?? null, this.input);
  }

  removeInputSource(source: InputSource): void {
    if (!this.sources.delete(source)) return;
    source.detach();
  }

  // ---- lifecycle ------------------------------------------------------------

  /** The netplay session the game is in, if any. */
  get net(): SharedTableSession | null {
    return this.netApi?.session ?? null;
  }

  get currentState(): EngineState {
    return this.state;
  }

  get error(): EngineError | null {
    return this.lastError;
  }

  /** (Re)loads the game code and runs `_init`. Returns the error if any. */
  load(): EngineError | null {
    this.teardownVm();
    this.console.clear();
    this.stats.reset();
    this.tileOverrides.clear();
    this.elapsed = 0;
    this.lastError = null;

    const lua = new LuaEnvironment();
    this.lua = lua;
    const ctx: ApiContext = {
      lua,
      gfx: this.opts.gfx,
      input: this.input,
      sound: this.opts.sound,
      netUi: this.opts.netUi,
      netPermissions: this.opts.netPermissions,
      onActionsDeclared: (actions) => {
        this.declaredActions = actions;
        this.opts.onActionsDeclared?.(actions);
      },
      data: {
        getFlag: (i) => this.opts.game.getFlag(i),
        getFlagBit: (i, b) => this.opts.game.getFlagBit(i, b),
        getTile: (x, y) =>
          this.tileOverrides.get(y * MAP_WIDTH + x) ?? this.opts.game.getTile(x, y),
        setTile: (x, y, n) => {
          this.tileOverrides.set(y * MAP_WIDTH + x, n & 0xff);
        },
      },
      sys: {
        dt: STEP_MS / 1000,
        frame: () => this.stats.frame,
        time: () => this.elapsed,
        fps: () => this.stats.fps,
      },
      log: (level, text) => {
        this.log(level, text);
      },
      print: (line) => {
        this.log('log', line);
      },
    };
    this.netApi = new NetAPI(ctx);
    this.modules = [
      new SysAPI(ctx),
      new GfxAPI(ctx),
      new MapAPI(ctx),
      new InputAPI(ctx),
      new SoundAPI(ctx),
      this.netApi,
    ];

    const { entry, modules, entryName } = this.opts.game.sources();
    try {
      if (this.opts.game.compat) lua.evaluate(buildCompatPrelude(), 'compat.lua');
      for (const [name, src] of modules) {
        // Other tabs are available through require("name"); loaded lazily by Lua.
        lua.setGlobalWith('__naucto_module_src_' + name, src);
        lua.evaluate(
          `package.preload[${JSON.stringify(name)}] = function(...) return load(__naucto_module_src_${name}, "=${name}.lua")(...) end`,
          'loader.lua',
        );
      }
      lua.evaluate(entry, entryName);
    } catch (e) {
      return this.fail('load', e);
    }
    this.opts.gfx.begin();
    try {
      lua.callGlobal('_init');
    } catch (e) {
      return this.fail('init', e);
    }
    this.setState('paused');
    return null;
  }

  run(): void {
    if (this.state === 'idle' || this.state === 'halted') {
      if (this.load()) return;
    }
    this.setState('running');
    this.loop.start();
  }

  pause(): void {
    if (this.state !== 'running') return;
    this.loop.stop();
    this.setState('paused');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.setState('running');
    this.loop.start();
  }

  /** One fixed step while paused. */
  stepOnce(): void {
    if (this.state !== 'paused') return;
    this.loop.stepOnce();
  }

  /** Stop and reset to idle; the game screen keeps its last frame. */
  stop(): void {
    this.loop.stop();
    this.teardownVm();
    this.setState('idle');
  }

  destroy(): void {
    this.stop();
    for (const src of this.sources) src.detach();
    this.sources.clear();
    this.errorListeners.clear();
    this.stateListeners.clear();
  }

  /** Drive the loop manually (tests / headless). */
  tick(elapsedMs: number): boolean {
    return this.loop.tick(elapsedMs);
  }

  screenshot(): Uint8ClampedArray | null {
    return this.opts.gfx.screenshot();
  }

  onError(l: (e: EngineError) => void): () => void {
    this.errorListeners.add(l);
    return () => this.errorListeners.delete(l);
  }

  onStateChange(l: (s: EngineState) => void): () => void {
    this.stateListeners.add(l);
    return () => this.stateListeners.delete(l);
  }

  // ---- internals ------------------------------------------------------------

  private step(): boolean {
    const lua = this.lua;
    if (!lua) return false;
    const t0 = performance.now();
    for (const src of this.sources) src.poll?.(this.input);
    this.input.commit();
    this.stats.frame++;
    this.elapsed = this.stats.frame * (STEP_MS / 1000);
    try {
      lua.callGlobal('_update');
    } catch (e) {
      this.fail('update', e);
      return false;
    }
    this.opts.gfx.begin();
    try {
      lua.callGlobal('_draw');
    } catch (e) {
      this.fail('draw', e);
      return false;
    }
    this.opts.sound?.flush();
    this.stats.recordStep(performance.now() - t0);
    return true;
  }

  private present(): void {
    this.opts.gfx.present();
    this.stats.recordPresent(performance.now());
  }

  private log(level: ConsoleLevel, text: string): void {
    this.console.append(level, text, this.stats.frame);
  }

  private fail(phase: EnginePhase, e: unknown): EngineError {
    const message = e instanceof Error ? e.message : String(e);
    const err: EngineError = {
      phase,
      message,
      kind: message.includes('possible infinite loop')
        ? 'budget'
        : phase === 'load' && message.startsWith('Failed to load')
          ? 'syntax'
          : 'runtime',
    };
    if (e instanceof LuaError) {
      if (e.file !== undefined) err.file = e.file;
      if (e.line !== undefined) err.line = e.line;
      if (e.traceback !== undefined) err.traceback = e.traceback;
    }
    this.lastError = err;
    this.log('error', `${phase}: ${message}`);
    this.loop.stop();
    this.setState('halted');
    this.errorListeners.forEach((l) => {
      l(err);
    });
    return err;
  }

  private teardownVm(): void {
    for (const m of this.modules) m.destroy();
    this.modules = [];
    this.lua?.close();
    this.lua = null;
  }

  private setState(s: EngineState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateListeners.forEach((l) => {
      l(s);
    });
  }
}
