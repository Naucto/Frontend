import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';

// A Lua value crosses the VM boundary as its JS counterpart, and `String()` of that is the JS
// spelling: "undefined" for nil, a fengari wrapper's source for a function.
const show = (a: unknown): string => {
  switch (typeof a) {
    case 'undefined':
      return 'nil';
    case 'boolean':
      return a ? 'true' : 'false';
    case 'function':
      return 'function';
    case 'object':
      return a === null ? 'nil' : JSON.stringify(a);
    case 'string':
      return a;
    default:
      return String(a);
  }
};

const join = (args: unknown[]): string => args.map(show).join('\t');

/** The `sys` namespace plus the global `print`. */
export class SysAPI extends EngineModule {
  constructor(ctx: ApiContext) {
    super(ctx);
    ctx.lua.setGlobalWith('print', (...args: unknown[]) => {
      ctx.log('log', join(args));
    });
    ctx.lua.setGlobalWith('sys', {
      dt: () => ctx.sys.dt,
      frame: () => ctx.sys.frame(),
      time: () => ctx.sys.time(),
      fps: () => ctx.sys.fps(),
      log: (...args: unknown[]) => {
        ctx.log('log', join(args));
      },
      warn: (...args: unknown[]) => {
        ctx.log('warn', join(args));
      },
      error: (...args: unknown[]) => {
        ctx.log('error', join(args));
      },
    });
  }
}
