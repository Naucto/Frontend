import { isAction } from '../input/ActionMap';
import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';

const player = (p: unknown): number => (typeof p === 'number' ? Math.max(0, Math.floor(p) - 1) : 0);

/** The `input` namespace. */
export class InputAPI extends EngineModule {
  constructor(ctx: ApiContext) {
    super(ctx);
    const s = ctx.input;
    ctx.lua.setGlobalWith('input', {
      held: (a: unknown, p?: unknown) => (isAction(a) ? s.btn(a, player(p)) : false),
      pressed: (a: unknown, p?: unknown) => (isAction(a) ? s.btnp(a, player(p)) : false),
      released: (a: unknown, p?: unknown) => (isAction(a) ? s.btnr(a, player(p)) : false),
      key_pressed: (k: unknown) => s.keyPressed(String(k)),
      key_down: (k: unknown) => s.keyDown(String(k)),
      get_mouse_pos: () => (s.mouseX === null ? [undefined, undefined] : [s.mouseX, s.mouseY]),
      mouse_pressed: (b?: unknown) => s.mousePressed(typeof b === 'number' ? b : 0),
      mouse_down: (b?: unknown) => s.mouseDown(typeof b === 'number' ? b : 0),
      players: () => s.connectedPlayers,
    });
  }

  /** A run does not hand the next one what it was holding. */
  override destroy(): void {
    this.ctx.input.reset();
  }
}
