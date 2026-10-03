import { InputState } from '../input/InputState';
import type { LuaEnvironment } from '../vm/LuaEnvironment';
import type { ApiContext } from './ApiContext';
import type { GameData, GfxBackend, SysPort } from './ports';

const stub = {} as unknown;

/** An API context with everything the module under test does not reach stubbed out. */
export const makeApiContext = (
  lua: LuaEnvironment,
  overrides: Partial<ApiContext> = {},
): ApiContext => ({
  lua,
  gfx: stub as GfxBackend,
  data: stub as GameData,
  sys: stub as SysPort,
  input: new InputState(),
  log: () => undefined,
  print: () => undefined,
  ...overrides,
});
