import { ACTIONS, type DeclaredAction, isAction } from '../input/ActionMap';
import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';

const player = (p: unknown): number => (typeof p === 'number' ? Math.max(0, Math.floor(p) - 1) : 0);

/** The `input` namespace. */
export class InputAPI extends EngineModule {
  constructor(ctx: ApiContext) {
    super(ctx);
    const s = ctx.input;
    ctx.lua.setGlobalWith('input', {
      btn: (a: unknown, p?: unknown) => (isAction(a) ? s.btn(a, player(p)) : false),
      btnp: (a: unknown, p?: unknown) => (isAction(a) ? s.btnp(a, player(p)) : false),
      btnr: (a: unknown, p?: unknown) => (isAction(a) ? s.btnr(a, player(p)) : false),
      key_pressed: (k: unknown) => s.keyPressed(String(k)),
      key_down: (k: unknown) => s.keyDown(String(k)),
      get_mouse_pos: () => (s.mouseX === null ? [undefined, undefined] : [s.mouseX, s.mouseY]),
      mouse_pressed: (b?: unknown) => s.mousePressed(typeof b === 'number' ? b : 0),
      mouse_down: (b?: unknown) => s.mouseDown(typeof b === 'number' ? b : 0),
      players: () => s.connectedPlayers,
      // The game names the actions it uses; the editor and the game page show those names instead
      // of raw engine ids, and the order follows the engine's canonical action order.
      declare: (table: unknown) => {
        const entries = (table ?? {}) as Record<string, unknown>;
        const declared: DeclaredAction[] = [];
        for (const action of ACTIONS) {
          const label = entries[action];
          if (typeof label === 'string' && label.trim() !== '') {
            declared.push({ action, label: label.trim() });
          }
        }
        for (const key of Object.keys(entries)) {
          if (!isAction(key)) {
            ctx.log('warn', `input.declare: "${key}" is not an action`);
          }
        }
        ctx.onActionsDeclared?.(declared);
      },
    });
  }
}
