import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';
import { defineLuaNamespace, luaFn, param } from './lua-namespace';

// Lua names nil, booleans and functions its own way, so a value read out of the VM is respelled
// here rather than handed to `String()`.
const show = (value: unknown): string => {
  switch (typeof value) {
    case 'undefined':
      return 'nil';
    case 'boolean':
      return value ? 'true' : 'false';
    case 'function':
      return 'function';
    case 'object':
      return value === null ? 'nil' : JSON.stringify(value);
    case 'string':
      return value;
    default:
      return String(value);
  }
};

const join = (args: unknown[]): string => args.map(show).join('\t');

export const SYS_API = defineLuaNamespace<SysAPI>('sys', {
  dt: luaFn(
    { summary: 'Fixed step length in seconds (1/60).', params: [], returns: 'number' },
    'dt',
  ),
  frame: luaFn({ summary: 'Frames since _init.', params: [], returns: 'number' }, 'frame'),
  time: luaFn({ summary: 'Seconds since _init.', params: [], returns: 'number' }, 'time'),
  fps: luaFn({ summary: 'Measured frames per second.', params: [], returns: 'number' }, 'fps'),
  log: luaFn(
    { summary: 'Write to the console (same as print).', params: [param.rest()], returns: null },
    'log',
  ),
  warn: luaFn(
    { summary: 'Write a warning to the console.', params: [param.rest()], returns: null },
    'warn',
  ),
  error: luaFn(
    { summary: 'Write an error line to the console.', params: [param.rest()], returns: null },
    'error',
  ),
});

/** The `sys` namespace plus the global `print`, which is `sys.log` under the name Lua gives it. */
export class SysAPI extends EngineModule {
  constructor(ctx: ApiContext) {
    super(ctx);
    ctx.lua.registerNamespace(SYS_API, this);
    ctx.lua.setGlobalWith('print', (...values: unknown[]) => {
      this.log(values);
    });
  }

  dt(): number {
    return this.ctx.sys.dt;
  }

  frame(): number {
    return this.ctx.sys.frame();
  }

  time(): number {
    return this.ctx.sys.time();
  }

  fps(): number {
    return this.ctx.sys.fps();
  }

  log(values: unknown[]): void {
    this.ctx.log('log', join(values));
  }

  warn(values: unknown[]): void {
    this.ctx.log('warn', join(values));
  }

  error(values: unknown[]): void {
    this.ctx.log('error', join(values));
  }
}
