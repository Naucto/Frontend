import type { LuaEnvironment } from '../vm/LuaEnvironment';
import type { EnginePorts } from './ports';

export interface ApiContext extends EnginePorts {
  lua: LuaEnvironment;
  print: (line: string) => void;
}
