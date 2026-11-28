import { highlightTree } from '@lezer/highlight';

import { luaLanguage } from '../code/lua-language';
import { naucto_highlight } from '../code/theme';

/**
 * The class the CODE tab's own highlighting gives each character of each line of a Lua text, so
 * a diff is coloured as the editor colours the same code. The classes are the highlight style's,
 * whose stylesheet the caller mounts.
 */
export function highlightLines(text: string): string[][] {
  const classes: string[] = new Array<string>(text.length).fill('');
  highlightTree(luaLanguage.parser.parse(text), naucto_highlight, (from, to, cls) => {
    for (let i = from; i < to; i += 1) {
      classes[i] = cls;
    }
  });
  const out: string[][] = [];
  let at = 0;
  for (const line of text.split('\n')) {
    out.push(classes.slice(at, at + line.length));
    at += line.length + 1;
  }
  return out;
}

/** A run of characters drawn alike. */
export interface Segment {
  text: string;
  cls: string;
}

/** `text` cut where its classes change, each run given `extra` beside its own class. */
export function segmentsOf(
  text: string,
  classes: readonly string[],
  offset: number,
  extra: string,
): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const cls = `${classes[offset + i] ?? ''} ${extra}`.trim();
    const last = out.at(-1);
    if (last?.cls === cls) {
      last.text += text[i] ?? '';
    } else {
      out.push({ text: text[i] ?? '', cls });
    }
  }
  return out;
}
