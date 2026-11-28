import type { Game } from '../game/Game';
import { type GfxCall, RecordingBackend } from '../gfx/RecordingBackend';
import type { InputSource } from '../input/InputSource';
import type { InputState } from '../input/InputState';
import type { ConsoleEntry } from '../loop/ConsoleBuffer';
import { STEP_MS } from '../loop/GameLoop';
import { netPermissionsOf } from '../net/rules';
import { LuaEnvironment, LuaError } from '../vm/LuaEnvironment';
import { Engine } from './Engine';
import type { EngineError } from './EngineError';

/** An action held down over a span of frames, both ends included. */
export interface HeldAction {
  action: string;
  /** 0 is the first player. */
  player?: number;
  from: number;
  to: number;
}

export interface HeadlessRun {
  /** Frames that ran whole. */
  frames: number;
  error: EngineError | null;
  console: Pick<ConsoleEntry, 'level' | 'text' | 'frame'>[];
  /** What the last frame drew, in order. */
  drawn: GfxCall[];
  /** Draws of that frame left out of {@link drawn}, past what is kept. */
  omitted: number;
  /** How many draws of each kind the last frame made. */
  counts: Record<string, number>;
}

const DRAWS_KEPT = 300;
/** Not draws: what a frame opens and closes with. */
const FRAME_OPS = new Set(['begin', 'present']);

/** Keeps the frame being drawn and nothing of those before it, so a long run stays small. */
class FrameRecorder extends RecordingBackend {
  readonly counts = new Map<string, number>();
  omitted = 0;

  constructor(private readonly colours: readonly string[]) {
    super();
    this.resetPalette();
  }

  override begin(): void {
    this.calls.length = 0;
    this.omitted = 0;
    this.counts.clear();
  }

  override present(): void {
    this.frames += 1;
  }

  override resetPalette(): void {
    this.palette.splice(0, this.palette.length, ...this.colours);
  }

  protected override rec(op: string, ...args: unknown[]): void {
    if (FRAME_OPS.has(op)) {
      return;
    }
    this.counts.set(op, (this.counts.get(op) ?? 0) + 1);
    if (this.calls.length < DRAWS_KEPT) {
      super.rec(op, ...args);
    } else {
      this.omitted += 1;
    }
  }
}

/**
 * Runs a game for a number of frames without a screen, a sound device or a session: what a tool
 * checks a game with. Nothing is drawn in pixels; what each call asked for is what is reported.
 *
 * The game's code runs in the calling process, within the engine's instruction budget and nothing
 * else: a caller that does not trust it runs this in a process of its own.
 */
export function runHeadless(
  game: Game,
  { frames, held = [] }: { frames: number; held?: readonly HeldAction[] },
): HeadlessRun {
  const gfx = new FrameRecorder(game.palette);
  let frame = 0;
  const source: InputSource = {
    attach: () => undefined,
    detach: () => undefined,
    poll: (state: InputState) => {
      for (const each of held) {
        state.press(each.player ?? 0, state.actions.bits.get(each.action) ?? 0, false);
      }
      for (const each of held) {
        if (frame >= each.from && frame <= each.to) {
          state.press(each.player ?? 0, state.actions.bits.get(each.action) ?? 0, true);
        }
      }
    },
  };
  const engine = new Engine({
    game,
    gfx,
    inputs: [source],
    driver: { request: () => 0, cancel: () => undefined },
    netPermissions: netPermissionsOf(game),
    consoleCapacity: 200,
  });
  try {
    if (!engine.load()) {
      engine.run();
      for (frame = 1; frame <= frames && !engine.error; frame += 1) {
        engine.tick(STEP_MS);
      }
    }
    return {
      frames: engine.error ? Math.max(0, engine.stats.frame - 1) : engine.stats.frame,
      error: engine.error,
      console: engine.console.lines.map(({ level, text, frame: at }) => ({
        level,
        text,
        frame: at,
      })),
      drawn: [...gfx.calls],
      omitted: gfx.omitted,
      counts: Object.fromEntries(gfx.counts),
    };
  } finally {
    engine.destroy();
  }
}

/** Why a piece of Lua does not parse, or null when it does. None of it is run. */
export function luaSyntaxError(
  source: string,
  name: string,
): { message: string; line: number | null } | null {
  const lua = new LuaEnvironment();
  try {
    lua.compile(source, name);
    return null;
  } catch (error) {
    if (error instanceof LuaError) {
      return { message: error.message, line: error.line ?? null };
    }
    throw error;
  } finally {
    lua.close();
  }
}
