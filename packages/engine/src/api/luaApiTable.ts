import { GFX_API } from './GfxAPI';
import { INPUT_API } from './InputAPI';
import type { LuaNamespace, LuaParam } from './lua-namespace';
import { MAP_API } from './MapAPI';
import { NET_API } from './NetAPI';
import { SOUND_API } from './SoundAPI';
import { SYS_API } from './SysAPI';

export interface LuaApiParam {
  name: string;
  type: string;
  optional: boolean;
  /** The Lua expression a left-out argument reads as, when there is one to show. */
  default?: string;
}

/** One member of the Lua API as the editor and the reference show it. */
export interface LuaApiEntry {
  ns: 'gfx' | 'map' | 'input' | 'sound' | 'sys' | 'net';
  name: string;
  kind: 'function' | 'value';
  /** Square brackets hold the optional arguments. */
  signature: string;
  summary: string;
  params: readonly LuaApiParam[];
  /** The Lua type of what a function returns, or of a value; null for a function returning nothing. */
  returns: string | null;
}

/** The order the reference lists the namespaces in. */
const NAMESPACES: Record<LuaApiEntry['ns'], LuaNamespace<never>> = {
  gfx: GFX_API,
  map: MAP_API,
  input: INPUT_API,
  sound: SOUND_API,
  sys: SYS_API,
  net: NET_API,
};

const signatureOf = (call: string, params: readonly LuaParam<unknown>[]): string => {
  const written = (each: LuaParam<unknown>): string => each.signature ?? each.name;
  const required = params.filter((each) => !each.optional).map(written);
  const optional = params.filter((each) => each.optional).map(written);
  const tail = optional.length ? `${required.length ? '[, ' : '['}${optional.join(', ')}]` : '';
  return `${call}(${required.join(', ')}${tail})`;
};

/**
 * Every member the namespaces register, in the order they declare them: what the editor completes
 * and what the reference is checked against, so neither can describe a function the VM lacks.
 */
export const LUA_API: readonly LuaApiEntry[] = Object.entries(NAMESPACES).flatMap(
  ([ns, namespace]) =>
    Object.entries(namespace.members).map(([name, member]): LuaApiEntry => {
      const call = `${ns}.${name}`;
      const base = { ns: ns as LuaApiEntry['ns'], name, summary: member.summary };
      if (member.kind === 'value') {
        return { ...base, kind: 'value', signature: call, params: [], returns: member.type };
      }
      return {
        ...base,
        kind: 'function',
        signature: signatureOf(call, member.params),
        params: member.params.map((each) => ({
          name: each.name,
          type: each.type,
          optional: each.optional,
          ...(each.default === undefined ? {} : { default: each.default }),
        })),
        returns: member.returns,
      };
    }),
);
