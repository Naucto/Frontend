/**
 * Just enough of a Lua reader to find a call by name in a file still being typed.
 *
 * The only parser in the tree throws on incomplete code, which is the state a file in an editor is
 * in most of the time. So these read a source once, keeping track of whether they are inside a
 * string or a comment, and only look at what they recognise by name.
 */

/** Where a `[[ … ]]` or `[=[ … ]=]` bracket opening here ends, or null where none opens. */
function longBracketEnd(s: string, at: number): number | null {
  const open = /^\[(=*)\[/.exec(s.slice(at, at + 16));
  if (!open) return null;
  const close = `]${open[1] ?? ''}]`;
  const end = s.indexOf(close, at + open[0].length);

  return end === -1 ? s.length : end + close.length;
}

/** How far a string or a comment runs from here, or `at` where this is neither. */
export function skipDead(s: string, at: number): number {
  if (s.startsWith('--', at)) {
    const long = longBracketEnd(s, at + 2);
    if (long !== null) return long;
    const end = s.indexOf('\n', at);

    return end === -1 ? s.length : end;
  }
  const long = longBracketEnd(s, at);
  if (long !== null) return long;
  const quote = s[at];
  if (quote !== '"' && quote !== "'") return at;
  // A short string ends with its line: one left open while typing must not swallow the file.
  let i = at + 1;
  while (i < s.length && s[i] !== quote && s[i] !== '\n') i += s[i] === '\\' ? 2 : 1;

  return Math.min(i + 1, s.length);
}

/** Whether this dotted name sits here whole: not the tail of a longer name, nor the head of one. */
export function matchesName(s: string, at: number, name: string): boolean {
  if (!s.startsWith(name, at)) return false;
  const before = s[at - 1];
  if (before !== undefined && /[\w.]/.test(before)) return false;
  const after = s[at + name.length];

  return after === undefined || !/\w/.test(after);
}

/** Whether a call by this name starts here, and is not the tail of a longer name. */
export function matchesCall(s: string, at: number, name: string): boolean {
  return matchesName(s, at, name) && /^\s*\(/.test(s.slice(at + name.length));
}

/**
 * The arguments of a call whose opening bracket has just been passed.
 *
 * Split on the commas of this call only, so a nested call keeps its own. Returns nothing where the
 * bracket never closes, which is a source still being typed.
 */
export function splitArgs(s: string, from: number): { parts: string[]; end: number } | null {
  const parts: string[] = [];
  let depth = 0;
  let start = from;
  let i = from;
  while (i < s.length) {
    const skipped = skipDead(s, i);
    if (skipped > i) {
      i = skipped;
      continue;
    }
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' && depth === 0) {
      parts.push(s.slice(start, i));

      return { parts, end: i };
    } else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (c === ',' && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }

  return null;
}
