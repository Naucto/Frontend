/**
 * Counts the "·" a file puts between two things on screen, for `pixel-check.mjs`.
 *
 * What is read is what reaches the screen: the catalogue's text, a template or a stylesheet without
 * its comments, and the string literals of a script. A comment may say "·" as often as it likes.
 */

/** The other ways to write the dot, and the dots that pass for it. */
const SPELLINGS = /[•∙⋅・]|&(?:middot|bull|#183|#xb7);|\\(?:u00b7|xb7|0{0,4}b7(?![\da-f]))/gi;

/**
 * A dot on its own with something other than a letter or a digit on one side. A run of them fills
 * an empty field and a dot inside a word is spelling; neither separates anything.
 */
const SEPARATOR = /(?<![·\p{L}\p{N}])·(?!·)|(?<!·)·(?![·\p{L}\p{N}])/gu;

const MARKUP_COMMENT = /<!--[\s\S]*?-->/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

/**
 * The string literals of a script, comments left out. A template literal gives its text between
 * its holes, and a hole is read as script again.
 */
function literals(source) {
  const found = [];
  // The brace depth each open `${` was met at: the `}` that comes back to it ends the hole.
  const holes = [];
  let depth = 0;
  let at = 0;
  while (at < source.length) {
    const char = source[at];
    const next = source[at + 1];
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', at);
      at = end === -1 ? source.length : end;
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', at + 2);
      at = end === -1 ? source.length : end + 2;
    } else if (char === "'" || char === '"') {
      let end = at + 1;
      while (end < source.length && source[end] !== char && source[end] !== '\n') {
        end += source[end] === '\\' ? 2 : 1;
      }
      found.push(source.slice(at + 1, end));
      at = end + 1;
    } else if (char === '`' || (char === '}' && holes.at(-1) === depth)) {
      if (char === '}') {
        holes.pop();
      }
      let end = at + 1;
      while (
        end < source.length &&
        source[end] !== '`' &&
        !(source[end] === '$' && source[end + 1] === '{')
      ) {
        end += source[end] === '\\' ? 2 : 1;
      }
      found.push(source.slice(at + 1, end));
      if (source[end] === '$') {
        holes.push(depth);
        at = end + 2;
      } else {
        at = end + 1;
      }
    } else {
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
      }
      at += 1;
    }
  }
  return found;
}

/** Removing a comment can join the two halves of another, so it is done until none is left. */
function withoutMarkupComments(text) {
  let stripped = text;
  let before;
  do {
    before = stripped;
    stripped = before.replace(MARKUP_COMMENT, '');
  } while (stripped !== before);
  return stripped;
}

export function separators(path, text) {
  let shown = text;
  if (path.endsWith('.ts')) {
    shown = withoutMarkupComments(literals(text).join('\n'));
  } else if (path.endsWith('.html')) {
    shown = withoutMarkupComments(text);
  } else if (path.endsWith('.css')) {
    shown = text.replace(BLOCK_COMMENT, '');
  }
  return [...shown.replace(SPELLINGS, '·').matchAll(SEPARATOR)].length;
}
