import { LUA_API } from './luaApiTable';

/**
 * Lua source defining every legacy global as a thin alias to its namespaced
 * replacement, warning once per name. Installed before user code when the game
 * has `compat` on, so un-migrated games keep running.
 */
export function buildCompatPrelude(): string {
  const lines: string[] = [
    'local __warned = {}',
    'local function __deprecated(old, new)',
    '  if not __warned[old] then',
    '    __warned[old] = true',
    '    sys.warn(old .. "() is deprecated, use " .. new .. "()")',
    '  end',
    'end',
  ];
  for (const e of LUA_API) {
    if (!e.legacy) continue;
    const full = `${e.ns}.${e.name}`;
    if (e.legacy === 'map') {
      // `map` is both the legacy function and the new namespace: make the table callable.
      lines.push(
        'setmetatable(map, { __call = function(_, x, y, ...) __deprecated("map", "map.draw") return map.draw(x, y, ...) end })',
      );
      continue;
    }
    if (e.legacyArgOrder) {
      const n = e.legacyArgOrder.length;
      const params = Array.from({ length: n }, (_, i) => `a${String(i)}`);
      const args = e.legacyArgOrder.map((i) => `a${String(i)}`);
      lines.push(
        `function ${e.legacy}(${params.join(', ')}) __deprecated("${e.legacy}", "${full}") return ${full}(${args.join(', ')}) end`,
      );
    } else {
      lines.push(
        `function ${e.legacy}(...) __deprecated("${e.legacy}", "${full}") return ${full}(...) end`,
      );
    }
  }
  return lines.join('\n');
}
