import { type ApiEntry } from '@app/shared/docs/docs.service';
import { hoverTooltip, type Tooltip } from '@codemirror/view';

export type ApiLookup = (name: string) => ApiEntry | null;
/** The other functions in a namespace, so the card can point at where the rest of them live. */
export type ApiPeers = (namespace: string) => readonly string[];

/** How many sibling names fit on the card before the rest become a count. */
const PEERS_SHOWN = 4;

/**
 * The card the documentation is shown on, wherever it is shown from.
 *
 * `active` is the argument the caret is inside, when the caller knows: the hover has no caret to
 * speak of, the signature help does.
 */
export function docCard(entry: ApiEntry, peers?: ApiPeers, active?: number): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'nc-doc-card';
  const sig = document.createElement('div');
  sig.className = 'nc-doc-card__sig';
  sig.textContent = entry.signature;
  const summary = document.createElement('div');
  summary.className = 'nc-doc-card__summary';
  summary.textContent = entry.summary;
  dom.append(sig, summary);
  if (entry.params.length) {
    const params = document.createElement('dl');
    params.className = 'nc-doc-card__params';
    entry.params.forEach((p, i) => {
      const dt = document.createElement('dt');
      dt.textContent = `${p.name} ${p.type}`;
      const dd = document.createElement('dd');
      dd.textContent = p.description;
      if (i === active) {
        dt.dataset.active = '';
        dd.dataset.active = '';
      }
      params.append(dt, dd);
    });
    dom.append(params);
  }
  // The rest of the namespace, by name — "MORE IN API" alone told you a namespace existed
  // without telling you what was in it.
  const namespace = entry.name.split('.')[0] ?? '';
  const siblings = (peers?.(namespace) ?? []).filter((n) => n !== entry.name);
  const more = document.createElement('div');
  more.className = 'nc-doc-card__more';
  if (siblings.length) {
    const shown = siblings.slice(0, PEERS_SHOWN).map((n) => n.split('.')[1] ?? n);
    const rest = siblings.length - shown.length;
    more.textContent = rest
      ? `${shown.join(' · ')} · + ${String(rest)} MORE IN ${namespace.toUpperCase()}`
      : `${shown.join(' · ')} — IN ${namespace.toUpperCase()}`;
  } else {
    more.textContent = `MORE IN API · ${namespace}`;
  }
  dom.append(more);
  return dom;
}

/** Hover card for namespaced calls (`gfx.draw_sprite`) and legacy names. */
export function luaHover(lookup: ApiLookup, peers?: ApiPeers): ReturnType<typeof hoverTooltip> {
  return hoverTooltip((view, pos): Tooltip | null => {
    const line = view.state.doc.lineAt(pos);
    const text = line.text;
    const col = pos - line.from;
    let start = col;
    let end = col;
    while (start > 0 && /[\w.]/.test(text[start - 1] ?? '')) start--;
    while (end < text.length && /[\w.]/.test(text[end] ?? '')) end++;
    const word = text.slice(start, end);
    if (!word) return null;
    const entry = lookup(word);
    if (!entry) return null;
    return {
      pos: line.from + start,
      end: line.from + end,
      above: true,
      create: () => ({ dom: docCard(entry, peers) }),
    };
  });
}
