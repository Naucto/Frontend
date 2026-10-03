import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';

// Lua names nil, booleans and functions its own way, so a value read out of the VM is respelled
// here rather than handed to `String()`.
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
    const log = (...args: unknown[]): void => {
      ctx.log('log', join(args));
    };
    ctx.lua.setGlobalWith('print', log);
    ctx.lua.setGlobalWith('sys', {
      dt: () => ctx.sys.dt,
      frame: () => ctx.sys.frame(),
      time: () => ctx.sys.time(),
      fps: () => ctx.sys.fps(),
      log,
      warn: (...args: unknown[]) => {
        ctx.log('warn', join(args));
      },
      error: (...args: unknown[]) => {
        ctx.log('error', join(args));
      },
    });
  }
}
