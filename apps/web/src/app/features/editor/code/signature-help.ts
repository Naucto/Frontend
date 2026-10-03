import { type EditorState, StateField } from '@codemirror/state';
import { showTooltip, type Tooltip } from '@codemirror/view';

import { type ApiLookup, type ApiPeers, docCard } from './lua-docs';

/** A function the project declares, which the manifest knows nothing about. */
export interface LocalSignature {
  name: string;
  params: string[];
  /** The tab it is written in, which is the only thing worth saying about a function with no docs. */
  file: string;
}

/**
 * How far back a call may start.
 *
 * Scanning is per keystroke, and a call whose opening parenthesis is further above the caret than
 * this is one nobody is still reading as a single call.
 */
const LOOKBACK_LINES = 20;

/**
 * The call the caret sits inside, and which of its arguments.
 *
 * Read forwards rather than backwards, because what makes a parenthesis real is everything before
 * it: quotes and comments have to be crossed in the order they were written to know whether the
 * character being counted is code at all. Lua's own parser is no help here — it is asked precisely
 * when the call is unfinished, which is the one thing it refuses to parse.
 */
function callAt(state: EditorState, pos: number): { name: string; arg: number } | null {
  const line = state.doc.lineAt(pos);
  const from = state.doc.line(Math.max(1, line.number - LOOKBACK_LINES)).from;
  const text = state.doc.sliceString(from, pos);
  const open: { at: number; commas: number }[] = [];
  let quote = '';
  let comment = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i] ?? '';
    if (comment) {
      if (char === '\n') {
        comment = false;
      }
      continue;
    }
    if (quote) {
      if (char === '\\') {
        i++;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '-' && text[i + 1] === '-') {
      comment = true;
    } else if (char === '(') {
      open.push({ at: i, commas: 0 });
    } else if (char === ')') {
      open.pop();
    } else if (char === ',' && open.length) {
      const top = open[open.length - 1];
      if (top) {
        top.commas++;
      }
    }
  }
  const call = open[open.length - 1];
  if (!call) {
    return null;
  }
  let start = call.at;
  while (start > 0 && /[\w.:]/.test(text[start - 1] ?? '')) {
    start--;
  }
  const name = text.slice(start, call.at);
  return name ? { name, arg: call.commas } : null;
}

/** The signature of a project function, with the argument being written picked out. */
function localCard(local: LocalSignature, active: number): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'nc-doc-card';
  const sig = document.createElement('div');
  sig.className = 'nc-doc-card__sig';
  sig.append(`${local.name}(`);
  local.params.forEach((param, i) => {
    if (i) {
      sig.append(', ');
    }
    const span = document.createElement('span');
    span.textContent = param;
    if (i === active) {
      span.dataset.active = '';
    }
    sig.append(span);
  });
  sig.append(')');
  const where = document.createElement('div');
  where.className = 'nc-doc-card__more';
  where.textContent = local.file;
  dom.append(sig, where);
  return dom;
}

/**
 * The documentation of the call being written, shown while it is written.
 *
 * Driven by the state rather than by the pointer, which is what separates it from the hover: it
 * follows the caret through the arguments and leaves when the call is closed.
 */
export function luaSignatureHelp(
  lookup: ApiLookup,
  peers: ApiPeers | undefined,
  locals: () => readonly LocalSignature[],
): StateField<Tooltip | null> {
  const tooltipAt = (state: EditorState): Tooltip | null => {
    const range = state.selection.main;
    if (!range.empty) {
      return null;
    }
    const call = callAt(state, range.head);
    if (!call) {
      return null;
    }
    const entry = lookup(call.name);
    if (entry) {
      return {
        pos: range.head,
        above: true,
        create: () => {
          const dom = docCard(entry, peers, call.arg);
          return {
            dom,
            // The card scrolls, so the active argument is brought into view — on mount, because
            // nothing scrolls before it is in the document.
            mount: () => {
              const active = dom.querySelector('[data-active]');
              if (!active) {
                return;
              }
              dom.scrollTop +=
                active.getBoundingClientRect().top -
                dom.getBoundingClientRect().top -
                dom.clientHeight / 3;
            },
          };
        },
      };
    }
    // A project's own function has names for its arguments and nothing else to say about them.
    const local = locals().find((candidate) => candidate.name === call.name);
    if (!local?.params.length) {
      return null;
    }
    return { pos: range.head, above: true, create: () => ({ dom: localCard(local, call.arg) }) };
  };

  return StateField.define<Tooltip | null>({
    create: tooltipAt,
    // No guard on docChanged or selection: what this can answer also depends on the manifest,
    // whose arrival is announced by a transaction that moves neither.
    update: (_value, tr) => tooltipAt(tr.state),
    provide: (field) => showTooltip.from(field),
  });
}

/** Every `function name(a, b)` a project declares, so the help can answer for those too. */
export function localSignatures(
  files: readonly { name: string; text: string }[],
): LocalSignature[] {
  const out: LocalSignature[] = [];
  for (const file of files) {
    for (const match of file.text.matchAll(/function\s+([\w.:]+)\s*\(([^)]*)\)/g)) {
      const name = match[1];
      if (!name) {
        continue;
      }
      out.push({
        name,
        params: (match[2] ?? '')
          .split(',')
          .map((param) => param.trim())
          .filter(Boolean),
        file: file.name,
      });
    }
  }
  return out;
}
