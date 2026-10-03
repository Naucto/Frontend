/**
 * The colour a Lua type is shown in, wherever a type is shown: the API cards, the arguments of a
 * signature and the editor's pop-over agree on it, so a reader learns each tone once.
 */
export type TypeTone = 'number' | 'string' | 'boolean' | 'table' | 'function' | 'any';

const TONED: ReadonlySet<string> = new Set(['number', 'string', 'boolean', 'table', 'function']);

/** `nil` and anything the manifest spells that is not a toned type fall to the grey of `any`. */
export function typeTone(type: string): TypeTone {
  const t = type.trim();
  return TONED.has(t) ? (t as TypeTone) : 'any';
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** An argument of a union type wears the first member's colour, the one the card lists first. */
const toneClass = (type: string): string => `nc-type--${typeTone(type.split('|')[0] ?? type)}`;

/** A type as a toned span; a union like `number|nil` is its members' spans joined by " or ". */
export function typeHtml(type: string): string {
  return type
    .split('|')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `<span class="nc-type ${toneClass(t)}">${escapeHtml(t)}</span>`)
    .join(' or ');
}

export interface SignatureSource {
  name: string;
  signature: string;
  params: readonly { name: string; type: string }[];
}

/** An identifier, `...`, one of the marks a signature draws optional arguments with, or one other character. */
const TOKEN = /\.\.\.|[A-Za-z_]\w*|[[\],]|[\s\S]/g;

/**
 * The whole signature as HTML: the name in `.api-sig-name`, each argument in `.nc-arg` with the tone
 * of its documented type, the brackets and commas in `.api-sig-opt`, everything else as text. A
 * token no parameter is documented under (the `r` of `hex | r`) stays plain text.
 */
export function signatureHtml(entry: SignatureSource): string {
  const signature = entry.signature || entry.name;
  const named = signature.startsWith(entry.name);
  const rest = named ? signature.slice(entry.name.length) : signature;
  const types = new Map(entry.params.map((p) => [p.name, p.type]));
  let html = named ? `<span class="api-sig-name">${escapeHtml(entry.name)}</span>` : '';
  for (const [token] of rest.matchAll(TOKEN)) {
    const type = types.get(token);
    if (type !== undefined)
      html += `<span class="nc-arg ${toneClass(type)}">${escapeHtml(token)}</span>`;
    else if (token === '[' || token === ']' || token === ',')
      html += `<span class="api-sig-opt">${token}</span>`;
    else html += escapeHtml(token);
  }
  return html;
}
