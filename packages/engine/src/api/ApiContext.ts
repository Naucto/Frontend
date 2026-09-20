import type { LuaEnvironment } from '../vm/LuaEnvironment';
import type { EnginePorts } from './ports';

export interface ApiContext extends EnginePorts {
  lua: LuaEnvironment;
  /** Legacy console sink (kept for NetAPI); equivalent to log('log', line). */
  print: (line: string) => void;
}
