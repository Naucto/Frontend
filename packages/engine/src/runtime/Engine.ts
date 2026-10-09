import type { ApiContext } from '../api/ApiContext';
import type { EngineModule } from '../api/EngineModule';
import { GfxAPI } from '../api/GfxAPI';
import { InputAPI } from '../api/InputAPI';
import { MapAPI } from '../api/MapAPI';
import { NetAPI } from '../api/NetAPI';
import type { ConsoleLevel, GfxBackend, SoundPort } from '../api/ports';
import { SoundAPI } from '../api/SoundAPI';
import { SysAPI } from '../api/SysAPI';
import type { Game } from '../game/Game';
import type { GameMap } from '../game/GameMap';
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

/** Globals the loader's chunks share, cleared once every file has run. */
const LOADER_PRELOAD = '__naucto_preload';
const LOADER_REQUIRE = '__naucto_require';
const LOADER_SOURCE = '__naucto_src';

/**
 * The loader, as the Lua chunks it evaluates in turn under the name `loader.lua`.
 *
 * `hide` takes the module system out of a game's globals, keeping private handles on the two pieces
 * the loader runs on: `package.preload`, where `register` files each tab's source under its name,
 * and `require`, which `run` calls once per tab, in tab order. `register` reads the source from
 * {@link LOADER_SOURCE}, which the host sets before each call.
 */
const LOADER = {
  chunk: 'loader.lua',
  hide: `
${LOADER_PRELOAD}, ${LOADER_REQUIRE} = package.preload, require
package, dofile, loadfile = nil, nil, nil
require = function()
  error('require is not available: files run in the order of their tabs', 2)
end
debug.sethook = function()
  error('debug.sethook is not available: the instruction budget belongs to the engine', 2)
end
`,
  register: (name: string): string =>
    `local src = ${LOADER_SOURCE}\n` +
    `${LOADER_PRELOAD}[${JSON.stringify(name)}] = function(...)\n` +
    `  local chunk, err = load(src, ${JSON.stringify(`=${name}`)})\n` +
    `  if not chunk then error(err, 0) end\n` +
    `  return chunk(...)\n` +
    `end`,
  run: (name: string): string => `${LOADER_REQUIRE}(${JSON.stringify(name)})`,
  clear: `${LOADER_PRELOAD}, ${LOADER_REQUIRE}, ${LOADER_SOURCE} = nil, nil, nil`,
} as const;

export interface EngineOptions {
  game: Game;
  gfx: GfxBackend;
  sound?: SoundPort;
  inputs?: InputSource[];
  /** Element that receives keyboard/mouse focus (the canvas). */
  inputTarget?: HTMLElement;
  netUi?: NetUi;
  /** Called on each load with the names the game document gives its actions, for the app to show. */
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
  /** Action names the game document gives its actions, as of the last load. */
  declaredActions: readonly DeclaredAction[] = [];

  private lua: LuaEnvironment | null = null;
  private modules: EngineModule[] = [];
  private gfxApi: GfxAPI | null = null;
  private netApi: NetAPI | null = null;
  private readonly loop: GameLoop;
  private state: EngineState = 'idle';
  private elapsed = 0;
  /** Per map, by id, keyed on that map's own width. */
  private readonly tileOverrides = new Map<string, Map<number, number>>();
  private readonly errorListeners = new Set<(error: EngineError) => void>();
  private readonly stateListeners = new Set<(state: EngineState) => void>();
  private lastError: EngineError | null = null;

  constructor(private readonly opts: EngineOptions) {
    this.console = new ConsoleBuffer(opts.consoleCapacity ?? 500);
    this.loop = new GameLoop(
      () => this.step(),
      () => this.present(),
      opts.driver,
    );
    for (const src of opts.inputs ?? []) {
      this.sources.add(src);
    }
    for (const src of this.sources) {
      src.attach(opts.inputTarget ?? null, this.input);
    }
  }

  /**
   * Plug in a source after construction — a pad that appears on rotate, a second gamepad — without
   * remounting the engine. Attaching twice is a no-op.
   */
  addInputSource(source: InputSource): void {
    if (this.sources.has(source)) {
      return;
    }
    this.sources.add(source);
    source.attach(this.opts.inputTarget ?? null, this.input);
  }

  removeInputSource(source: InputSource): void {
    if (!this.sources.delete(source)) {
      return;
    }
    source.detach();
  }

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

  /**
   * (Re)loads the game code and runs `_init`. Returns the error if any.
   *
   * `hold` is for reloading a paused game: the port is held before any game code runs, so what
   * `_init` starts waits with the game instead of playing under a frozen screen.
   */
  load({ hold = false }: { hold?: boolean } = {}): EngineError | null {
    this.teardownVm();
    this.console.clear();
    this.stats.reset();
    this.tileOverrides.clear();
    this.opts.gfx.clearTileOverrides();
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
        mapCount: () => this.opts.game.maps.length,
        mapWidth: (i) => this.opts.game.maps[i]?.width ?? 0,
        mapHeight: (i) => this.opts.game.maps[i]?.height ?? 0,
        getFlag: (i) => this.opts.game.flagOf(i),
        getFlagBit: (index, bit) => this.opts.game.flagBitOf(index, bit),
        getTile: (x, y, i) => {
          const map = this.mapAt(i, x, y);
          if (!map) {
            return 0;
          }

          return this.tileOverrides.get(map.id)?.get(y * map.width + x) ?? map.getTile(x, y);
        },
        setTile: (x, y, sprite, i) => {
          const map = this.mapAt(i, x, y);
          if (!map) {
            return;
          }
          let mine = this.tileOverrides.get(map.id);
          if (!mine) {
            mine = new Map();
            this.tileOverrides.set(map.id, mine);
          }
          mine.set(y * map.width + x, sprite & 0xffff);
          this.opts.gfx.setTileOverride(x, y, sprite & 0xffff, i);
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
    this.gfxApi = new GfxAPI(ctx);
    this.modules = [
      new SysAPI(ctx),
      this.gfxApi,
      new MapAPI(ctx),
      new InputAPI(ctx),
      new SoundAPI(ctx),
      this.netApi,
    ];
    // The labels are the document's, not the code's, so they reach the host whether or not the
    // code loads: a game that errors on load still has a controls table to show.
    ctx.onActionsDeclared?.(this.opts.game.declaredActions);
    if (hold) {
      this.opts.sound?.pause();
    }

    try {
      // Each file is loaded as its own chunk under its own name, which is what makes a Lua error
      // name the tab it came from and count lines from that tab's first line.
      const files = this.opts.game.sources();
      lua.knowChunks(files.map((file) => file.name));
      lua.evaluate(LOADER.hide, LOADER.chunk);
      for (const file of files) {
        lua.setGlobalWith(LOADER_SOURCE, file.source);
        lua.evaluate(LOADER.register(file.name), LOADER.chunk);
      }
      for (const file of files) {
        lua.evaluate(LOADER.run(file.name), LOADER.chunk);
      }
      lua.evaluate(LOADER.clear, LOADER.chunk);
    } catch (error) {
      return this.fail('load', error);
    }
    this.opts.gfx.begin();
    try {
      lua.callGlobal('_init');
    } catch (error) {
      return this.fail('init', error);
    }
    this.setState('paused');
    return null;
  }

  run(): void {
    if (this.state === 'paused') {
      this.resume();
      return;
    }

    if (this.state === 'idle' || this.state === 'halted') {
      if (this.load()) {
        return;
      }
    }
    this.setState('running');
    this.loop.start();
  }

  pause(): void {
    if (this.state !== 'running') {
      return;
    }
    this.loop.stop();
    // The music plays in an audio graph of its own, not in the loop, so stopping the loop leaves
    // it going. Held rather than stopped: a paused game goes on from the note it was on.
    this.opts.sound?.pause();
    this.setState('paused');
  }

  resume(): void {
    if (this.state !== 'paused') {
      return;
    }
    this.opts.sound?.resume();
    this.setState('running');
    this.loop.start();
  }

  /** One fixed step; a running game is paused first, so the button also serves as a pause. */
  stepOnce(): void {
    if (this.state === 'running') {
      this.pause();
    }
    if (this.state !== 'paused') {
      return;
    }
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
    for (const src of this.sources) {
      src.detach();
    }
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

  onError(listener: (error: EngineError) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onStateChange(listener: (state: EngineState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  // ---- internals ------------------------------------------------------------

  /** One fixed update. Drawing is the frame's, in {@link present}: a catch-up step draws nothing. */
  private step(): boolean {
    const lua = this.lua;
    if (!lua) {
      return false;
    }
    const t0 = performance.now();
    for (const src of this.sources) {
      src.poll?.(this.input);
    }
    this.input.commit();
    this.stats.frame++;
    this.elapsed = this.stats.frame * (STEP_MS / 1000);
    try {
      lua.callGlobal('_update');
    } catch (error) {
      this.fail('update', error);
      return false;
    }
    this.opts.sound?.flush();
    this.stats.recordUpdate(performance.now() - t0);
    return true;
  }

  /** Draws the state the last step left and shows it; a draw that fails still shows what it drew. */
  private present(): boolean {
    const lua = this.lua;
    if (!lua) {
      return false;
    }
    const t0 = performance.now();
    const ok = this.draw(lua);
    this.opts.gfx.present();
    const now = performance.now();
    this.stats.recordDraw(now - t0);
    this.stats.recordPresent(now);
    return ok;
  }

  private draw(lua: LuaEnvironment): boolean {
    this.opts.gfx.begin();
    try {
      lua.callGlobal('_draw');
    } catch (error) {
      this.fail('draw', error);
      return false;
    }
    // Looked up every frame, since a game may define or replace it at any time; a game without one
    // pays this one lookup and nothing else.
    const scanline = lua.getGlobalFunction('_scanline');
    if (scanline && this.gfxApi) {
      try {
        this.gfxApi.beam(scanline);
      } catch (error) {
        this.fail('scanline', error);
        return false;
      }
    }
    return true;
  }

  /**
   * The map a tile read or write names, or null when the game has no such map or the cell is off
   * it. Bounds are checked here rather than by the caller because the override key is row-major and
   * wraps: an unchecked cell off the right edge reads the next row's.
   */
  private mapAt(map: number, x: number, y: number): GameMap | null {
    const found = this.opts.game.maps[map];
    if (!found || x < 0 || x >= found.width || y < 0 || y >= found.height) {
      return null;
    }

    return found;
  }

  private log(level: ConsoleLevel, text: string): void {
    this.console.append(level, text, this.stats.frame);
  }

  private fail(phase: EnginePhase, error: unknown): EngineError {
    const message = error instanceof Error ? error.message : String(error);
    const engineError: EngineError = {
      phase,
      message,
      kind: message.includes('possible infinite loop')
        ? 'budget'
        : phase === 'load' && message.startsWith('Failed to load')
          ? 'syntax'
          : 'runtime',
    };
    if (error instanceof LuaError) {
      if (error.file !== undefined) {
        engineError.file = error.file;
      }
      if (error.line !== undefined) {
        engineError.line = error.line;
      }
      if (error.traceback !== undefined) {
        engineError.traceback = error.traceback;
      }
    }
    this.lastError = engineError;
    this.log('error', `${phase}: ${message}`);
    this.loop.stop();
    // The VM is kept for the error to be read against, so no module teardown silences the audio: it
    // is stopped here.
    this.opts.sound?.stopAll();
    this.setState('halted');
    this.errorListeners.forEach((listener) => {
      listener(engineError);
    });
    return engineError;
  }

  private teardownVm(): void {
    for (const module of this.modules) {
      module.destroy();
    }
    this.modules = [];
    this.gfxApi = null;
    this.lua?.close();
    this.lua = null;
  }

  private setState(state: EngineState): void {
    if (this.state === state) {
      return;
    }
    this.state = state;
    this.stateListeners.forEach((listener) => {
      listener(state);
    });
  }
}
