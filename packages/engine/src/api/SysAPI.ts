import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';

const join = (args: unknown[]): string =>
  args.map((a) => (typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a))).join('\t');

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
