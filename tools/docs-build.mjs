// Builds the Engine-Documentation submodule (docs/) into apps/web/public/docs/: index.json holds
// the Markdown pages as HTML (marked + a small Lua highlighter), api/ as the function manifest
// and a search index; img/ holds every picture a page shows. A console entry's signature, summary
// and parameters come from the engine's own description, which `npm run docs:api` writes first.
// Run: npm run docs:build
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import { marked } from 'marked';
import { parse as parseYaml } from 'yaml';

import {
  engineApiPath,
  fullName,
  loadApi,
  readEngineApi,
  withEngine,
} from '../docs/scripts/api.mjs';

const root = resolve(import.meta.dirname, '..');
const docs = resolve(root, 'docs');
const out = resolve(root, 'apps/web/public/docs');

// ---- Lua highlighting (build time, no runtime dependency) --------------------------
const LUA_KW = new Set(
  'and break do else elseif end false for function goto if in local nil not or repeat return then true until while'.split(
    ' ',
  ),
);
const LUA_CB = new Set(['_init', '_update', '_draw']);
const esc = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
// Tag stripping has to run until it reaches a fixed point: a single pass over
// "<<span>script>" would leave "<script>" behind.
const stripTags = (s) => {
  let prev;
  let cur = s;
  do {
    prev = cur;
    cur = cur.replace(/<[^>]*>/g, '');
  } while (cur !== prev);
  return cur;
};
// ---- ascii diagrams -----------------------------------------------------------
/**
 * Renders box art on its own character grid: strokes and arrowheads become vectors, the rest
 * labels, and a block that does not read as art stays a code block.
 */
const CELL_W = 8;
const CELL_H = 18;

/** Art, or prose that happens to be fenced? Needs corners or connectors, on more than one line. */
export function looksLikeDiagram(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 3) {
    return false;
  }
  // Counted as plain substrings: an arrow alternation reads to static analysis as an HTML-comment
  // filter.
  const count = (needle) => text.split(needle).length - 1;
  const corners = (text.match(/\+[-+]/g) ?? []).length;
  const arrows = count('->') + count('<-');
  const pipes = lines.filter((l) => l.includes('|')).length;
  // A line ending in a pipe is a connector dropping to the next row.
  const dangling = lines.filter((l) => l.trimEnd().endsWith('|')).length;
  // Two columns under a rule of dashes, wired by arrows, carry neither corners nor pipes.
  const rules = lines.filter((l) => /(^|\s)-{4,}(\s|$)/.test(l)).length;
  return corners >= 2 || ((arrows >= 1 || dangling >= 1) && (pipes >= 2 || rules >= 1));
}

export function asciiToSvg(text) {
  const raw = text.replace(/\t/g, '    ').split('\n');
  while (raw.length && !raw[0].trim()) {
    raw.shift();
  }
  while (raw.length && !raw[raw.length - 1].trim()) {
    raw.pop();
  }
  if (!raw.length) {
    return null;
  }

  // left-trim the common indent so an indented block and a fenced one draw the same
  const indent = Math.min(
    ...raw.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length),
  );
  const lines = raw.map((l) => l.slice(indent));

  const rows = lines.length;
  const cols = Math.max(...lines.map((l) => l.length));
  const at = (r, c) => (r < 0 || r >= rows ? ' ' : (lines[r][c] ?? ' '));
  const used = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const strokes = [];
  const heads = [];

  const cx = (c) => c * CELL_W + CELL_W / 2;
  const cy = (r) => r * CELL_H + CELL_H / 2;

  // horizontal runs: two or more dashes, extended through the + corners at either end
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (at(r, c) !== '-') {
        continue;
      }
      let e = c;
      while (at(r, e + 1) === '-') {
        e++;
      }
      if (e - c + 1 >= 2) {
        let s = c;
        if (at(r, s - 1) === '+') {
          s--;
        }
        let t = e;
        if (at(r, t + 1) === '+') {
          t++;
        }
        for (let i = s; i <= t; i++) {
          used[r][i] = true;
        }
        strokes.push(`<line x1="${cx(s)}" y1="${cy(r)}" x2="${cx(t)}" y2="${cy(r)}"/>`);
      }
      c = e;
    }
  }
  // vertical runs
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (at(r, c) !== '|') {
        continue;
      }
      let e = r;
      while (at(e + 1, c) === '|') {
        e++;
      }
      let s = r;
      if (at(s - 1, c) === '+') {
        s--;
      }
      let t = e;
      if (at(t + 1, c) === '+') {
        t++;
      }
      if (t - s >= 1) {
        for (let i = s; i <= t; i++) {
          used[i][c] = true;
        }
        strokes.push(`<line x1="${cx(c)}" y1="${cy(s)}" x2="${cx(c)}" y2="${cy(t)}"/>`);
      }
      r = e;
    }
  }
  // arrowheads, but only where a stroke actually arrives — otherwise the v in "every" becomes one
  const HEAD = {
    v: (r, c) => at(r - 1, c) === '|' || at(r - 1, c) === '+',
    '^': (r, c) => at(r + 1, c) === '|' || at(r + 1, c) === '+',
    '>': (r, c) => at(r, c - 1) === '-',
    '<': (r, c) => at(r, c + 1) === '-',
  };
  const POINTS = {
    v: (x, y) => `${x - 4},${y - 4} ${x + 4},${y - 4} ${x},${y + 4}`,
    '^': (x, y) => `${x - 4},${y + 4} ${x + 4},${y + 4} ${x},${y - 4}`,
    '>': (x, y) => `${x - 4},${y - 4} ${x - 4},${y + 4} ${x + 4},${y}`,
    '<': (x, y) => `${x + 4},${y - 4} ${x + 4},${y + 4} ${x - 4},${y}`,
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = at(r, c);
      const test = HEAD[ch];
      if (!test || used[r][c] || !test(r, c)) {
        continue;
      }
      used[r][c] = true;
      heads.push(`<polygon points="${POINTS[ch](cx(c), cy(r))}"/>`);
    }
  }

  // whatever is left is a label
  const labels = [];
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      if (used[r][c] || at(r, c) === ' ') {
        c++;
        continue;
      }
      const s = c;
      let run = '';
      while (c < cols && !used[r][c] && at(r, c) !== ' ') {
        run += at(r, c++);
      }
      // keep single spaces inside a phrase together, so words do not split into separate <text>
      while (c + 1 < cols && at(r, c) === ' ' && !used[r][c + 1] && at(r, c + 1) !== ' ') {
        run += ' ';
        c++;
        while (c < cols && !used[r][c] && at(r, c) !== ' ') {
          run += at(r, c++);
        }
      }
      // textLength pins the run to exactly the columns it occupied, so a label lands on the grid
      // whatever the rendered font's advance width turns out to be.
      labels.push(
        `<text x="${s * CELL_W}" y="${cy(r) + 4}" textLength="${run.length * CELL_W}" ` +
          `lengthAdjust="spacingAndGlyphs">${esc(run)}</text>`,
      );
    }
  }

  const w = cols * CELL_W;
  const h = rows * CELL_H;
  return (
    `<figure class="doc-diagram"><svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" ` +
    `role="img" aria-label="Diagram"><title>${esc(text.trim())}</title>` +
    `<g class="d-stroke">${strokes.join('')}</g>` +
    `<g class="d-head">${heads.join('')}</g>` +
    `<g class="d-label">${labels.join('')}</g>` +
    `</svg></figure>\n`
  );
}

export function highlightLua(code) {
  const re =
    /(--\[\[[\s\S]*?\]\]|--[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|(\b[a-z][a-z0-9]*\.[a-z_][a-z0-9_]*\b(?=\s*\())|(\b[A-Za-z_]\w*\b)/g;
  let html = '';
  let last = 0;
  for (const m of code.matchAll(re)) {
    html += esc(code.slice(last, m.index));
    const [text, cmt, str, num, api, word] = m;
    if (cmt) {
      html += `<span class="tok-cmt">${esc(text)}</span>`;
    } else if (str) {
      html += `<span class="tok-str">${esc(text)}</span>`;
    } else if (num) {
      html += `<span class="tok-num">${esc(text)}</span>`;
    } else if (api) {
      html += `<span class="tok-api" data-api="${esc(text)}">${esc(text)}</span>`;
    } else if (word && LUA_KW.has(word)) {
      html += `<span class="tok-kw">${esc(text)}</span>`;
    } else if (word && LUA_CB.has(word)) {
      html += `<span class="tok-cb">${esc(text)}</span>`;
    } else {
      html += esc(text);
    }
    last = m.index + text.length;
  }
  return html + esc(code.slice(last));
}

// ---- markdown ----------------------------------------------------------------
function frontMatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(src);
  if (!m) {
    return { meta: {}, body: src };
  }
  return { meta: parseYaml(m[1]), body: src.slice(m[0].length) };
}

const refLink = (name) =>
  `<a class="api-ref" href="/learn/api/${name.split('.')[0]}#${name}" data-api="${name}"><code>${name}</code></a>`;

// ---- pictures ----------------------------------------------------------------
/**
 * The page being rendered, for the pictures it shows: a picture is named relative to its page,
 * and lands in the built output under its path from the docs root, so `img/hero.png` beside
 * `content/editors/art.md` is served at `/docs/img/content/editors/img/hero.png`.
 */
let currentPage = null;
/** Every picture a page referenced, copied once the page is rendered. */
const pictures = new Map();

/** Width and height from the header, so the page keeps its shape while the picture loads. */
function pictureSize(bytes) {
  if (bytes.length > 24 && bytes.toString('latin1', 1, 4) === 'PNG') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 10 && bytes.toString('latin1', 0, 3) === 'GIF') {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  return null;
}

const exists = (p) =>
  stat(p).then(
    () => true,
    () => false,
  );

/**
 * A picture, as a figure.
 *
 * A dark capture on the light theme reads as a hole in the page, so a page may carry both: the
 * light one is the same name with `.light` before the extension, and the two are emitted together
 * for the stylesheet to show one of. A capture of the console itself (anything under `frames/`)
 * is marked so it is drawn pixel for pixel rather than smoothed.
 */
function picture(href, alt, title) {
  const page = currentPage;
  if (!page || /^(https?:)?\/\//.test(href)) {
    return `<img src="${esc(href)}" alt="${esc(alt)}">`;
  }
  const src = resolve(page.dir, href);
  const rel = relative(docs, src);
  const light = src.replace(/(\.[a-z0-9]+)$/i, '.light$1');
  pictures.set(rel, src);
  const url = `/docs/img/${rel.split('\\').join('/')}`;
  const size = page.sizes.get(src);
  const dims = size ? ` width="${size.width}" height="${size.height}"` : '';
  const frame = /(^|\/)frames\//.test(rel) ? ' doc-frame' : '';
  const shape = !size ? '' : size.height > size.width * 1.15 ? ' doc-figure--tall' : '';
  const img = (u, cls) =>
    `<img class="${cls}" src="${esc(u)}" alt="${esc(alt)}"${dims} loading="lazy">`;
  const pair = page.sizes.has(light)
    ? (pictures.set(rel.replace(/(\.[a-z0-9]+)$/i, '.light$1'), light),
      img(url, 'doc-dark') + img(url.replace(/(\.[a-z0-9]+)$/i, '.light$1'), 'doc-light'))
    : img(url, '');
  const caption = title || alt;
  return `<figure class="doc-figure${frame}${shape}">${pair}${
    caption ? `<figcaption>${esc(caption)}</figcaption>` : ''
  }</figure>`;
}

async function inlineDiagrams(md, dir) {
  const refs = [...md.matchAll(/\{\{svg:([^}\s]+)\}\}/g)];
  let out = md;
  for (const m of refs) {
    const src = resolve(dir, m[1]);
    const svg = (await readFile(src, 'utf8')).trim();
    const box = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    if (!box) {
      throw new Error(`${relative(docs, src)}: an authored diagram needs a viewBox`);
    }
    const styled = svg.replace(/^<svg\b/, `<svg style="max-width:${box[1]}px"`);
    out = out.replace(
      m[0],
      `\n<figure class="doc-diagram doc-diagram--authored">${styled}</figure>\n`,
    );
  }
  return out;
}

/** The sizes of a page's pictures, read before rendering because the renderer is synchronous. */
async function sizesOf(dir, hrefs) {
  const sizes = new Map();
  for (const href of hrefs) {
    if (/^(https?:)?\/\//.test(href)) {
      continue;
    }
    const src = resolve(dir, href);
    for (const candidate of [src, src.replace(/(\.[a-z0-9]+)$/i, '.light$1')]) {
      if (sizes.has(candidate) || !(await exists(candidate))) {
        continue;
      }
      const size = pictureSize(await readFile(candidate));
      if (size) {
        sizes.set(candidate, size);
      }
    }
  }
  return sizes;
}

/** A figure is a block; the paragraph marked wrapped it in is not. */
const unwrapFigures = (html) => html.replace(/<p>(<figure[\s\S]*?<\/figure>)<\/p>/g, '$1');

marked.use({
  renderer: {
    code({ text, lang }) {
      if (lang === 'lua') {
        return `<pre class="lua"><code>${highlightLua(text)}</code></pre>\n`;
      }
      // Unlabelled code, fenced or indented, may be box art.
      if (!lang && looksLikeDiagram(text)) {
        const svg = asciiToSvg(text);
        if (svg) {
          return svg;
        }
      }
      return `<pre><code>${esc(text)}</code></pre>\n`;
    },
    // marked hands a renderer the source text and its inline tokens and uses the return verbatim,
    // so the tokens are rendered here.
    link({ href, tokens }) {
      const external = /^https?:/.test(href);
      const text = this.parser.parseInline(tokens);
      return `<a href="${esc(href)}"${external ? ' target="_blank" rel="noreferrer"' : ''}>${text}</a>`;
    },
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const id = stripTags(text.toLowerCase())
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const step = depth === 2 && currentPage?.steps ? /^Step (\d+):/.exec(stripTags(text)) : null;
      const stand = step
        ? ` data-step="${step[1]}" data-steps="${currentPage.steps}" style="--step:${step[1]};--steps:${currentPage.steps}"`
        : '';
      return `<h${depth} id="${id}"${stand}>${text}</h${depth}>\n`;
    },
    image({ href, title, text }) {
      return picture(href, text, title ?? '');
    },
  },
});

/** GitHub-style callouts: "> [!NOTE]" blockquotes → <aside class="callout note">. */
function callouts(html) {
  return html
    .replace(
      /<blockquote>\s*<p>\[!(NOTE|WARNING|TIP|IMPORTANT|TRY)\]\s*(?:<br>)?\n?/g,
      (_, k) => `<aside class="callout ${k.toLowerCase()}" data-kind="${k}"><p>`,
    )
    .replace(/<\/blockquote>/g, (m, off, s) =>
      s.lastIndexOf('<aside class="callout', off) > s.lastIndexOf('<blockquote>', off)
        ? '</aside>'
        : m,
    );
}

function renderMarkdown(md) {
  const withRefs = md.replace(/\[\[([a-z][a-z0-9]*\.[a-z_][a-z0-9_]*)\]\]/g, (_, n) => refLink(n));
  return unwrapFigures(callouts(marked.parse(withRefs, { gfm: true })));
}

/**
 * A tutorial's whole game, folded, spliced in after rendering because marked ends an HTML block at
 * its first blank line.
 */
const LISTING_MARK = '<!--naucto:listing-->';
const LISTING_TIP =
  '\n> [!TIP]\n> Copy to new game, at the top of this page, puts this whole file in a game of your own.\n\n';
function listing(code) {
  const lines = code.split('\n').length;
  return (
    `<details class="doc-listing"><summary>Complete code · ${lines} lines</summary>` +
    `<pre class="lua"><code>${highlightLua(code)}</code></pre></details>\n`
  );
}

function headingsOf(html) {
  return [...html.matchAll(/<h([123]) id="([^"]+)"[^>]*>(.*?)<\/h\1>/g)].map((m) => ({
    level: Number(m[1]),
    id: m[2],
    text: stripTags(m[3]),
  }));
}

const plainText = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function sectionsOf(html) {
  const parts = html.split(/(?=<h[123] id=")/);
  const sections = [];
  for (const part of parts) {
    const head = /^<h([123]) id="([^"]+)"[^>]*>(.*?)<\/h\1>/.exec(part);
    if (!head) {
      continue;
    }
    sections.push({
      id: head[2],
      title: stripTags(head[3]),
      text: plainText(part.slice(head[0].length)),
    });
  }
  return sections;
}

// ---- walk ---------------------------------------------------------------------
async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

const pages = [];
const lua = {};
for await (const file of walk(resolve(docs, 'content'))) {
  if (!file.endsWith('.md')) {
    continue;
  }
  const src = await readFile(file, 'utf8');
  const { meta, body } = frontMatter(src);
  let code = null;
  if (meta.lua) {
    code = await readFile(join(dirname(file), meta.lua), 'utf8');
    lua[meta.slug] = code;
  }
  const assets = meta.assets
    ? JSON.parse(await readFile(join(dirname(file), meta.assets), 'utf8'))
    : null;
  const apis = [];
  const md0 = body
    .replace(/\{\{lua:[^}]+\}\}/g, () => `${LISTING_TIP}${LISTING_MARK}\n`)
    .replace(/\{\{api:([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)\}\}/g, (_, n) => {
      apis.push(n);
      return `<div class="api-card" data-api="${n}"></div>`;
    });
  currentPage = {
    dir: dirname(file),
    sizes: await sizesOf(
      dirname(file),
      [...body.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((m) => m[1]),
    ),
    steps: (body.match(/^## Step \d+:/gm) ?? []).length,
  };
  const md = await inlineDiagrams(md0, dirname(file));
  const html = renderMarkdown(md).replace(LISTING_MARK, () => (code ? listing(code) : ''));
  currentPage = null;
  pages.push({
    slug: meta.slug ?? relative(resolve(docs, 'content'), file).replace(/\.md$/, ''),
    title: meta.title ?? meta.slug,
    section: meta.section ?? 'reference',
    order: meta.order ?? 99,
    description: meta.description ?? '',
    namespace: meta.namespace ?? null,
    lua: code,
    assets,
    apis,
    headings: headingsOf(html),
    sections: sectionsOf(html),
    html,
    text: plainText(html),
  });
}

// ---- manifest -------------------------------------------------------------------
const engine = await readEngineApi();
if (!engine) {
  throw new Error(`docs-build: no engine API at ${engineApiPath}; run npm run docs:build`);
}
const api = withEngine(await loadApi(resolve(docs, 'api')), engine);
if (api.problems.length) {
  throw new Error(`docs-build: the pages and the engine disagree\n${api.problems.join('\n')}`);
}
const namespaces = [];
const index = {};
for (const ns of api.namespaces) {
  const entry = {
    namespace: ns.namespace,
    title: ns.title,
    ...(ns.standard ? { standard: true } : {}),
    functions: [],
    values: [],
  };
  const all = [...ns.functions, ...ns.values];
  currentPage = {
    dir: ns.dir,
    sizes: await sizesOf(
      ns.dir,
      all.flatMap((f) => (f.picture ? [f.picture] : [])),
    ),
  };
  for (const kind of ['functions', 'values']) {
    for (const f of ns[kind]) {
      const full = fullName(ns, f);
      const item = {
        // A frame beside the words: what the call draws, on content the reader has seen.
        pictureHtml: f.picture ? picture(f.picture, f.caption ?? full, f.caption ?? '') : '',
        name: full,
        kind: kind === 'values' ? 'value' : 'function',
        signature: f.signature,
        summary: f.summary ?? '',
        descriptionHtml:
          (f.description ? renderMarkdown(f.description) : '') +
          // A standard Lua entry links to its section of the manual, which settles what the card
          // only summarises.
          (f.manual
            ? `<p class="api-manual"><a href="${esc(f.manual)}" target="_blank" rel="noreferrer">${esc(full)} in the Lua 5.3 reference manual</a></p>\n`
            : ''),
        params: (f.params ?? []).map((p) => ({
          ...p,
          descriptionHtml: renderMarkdown(p.description ?? '').replace(/^<p>|<\/p>\s*$/g, ''),
        })),
        returns: f.returns ? renderMarkdown(f.returns).replace(/^<p>|<\/p>\s*$/g, '') : null,
        returnType: f.returnType ?? null,
        examples: (f.examples ?? []).map((e) => ({ code: e, html: highlightLua(e) })),
        notes: (f.notes ?? []).map((n) => ({ kind: n.kind, html: renderMarkdown(n.text ?? '') })),
        since: String(f.since ?? ''),
        seeAlso: f.seeAlso ?? [],
        ...(f.standard ? { standard: true, manual: f.manual } : {}),
      };
      entry[kind].push(item);
      index[full] = item;
    }
  }
  namespaces.push(entry);
  currentPage = null;
}

const SECTIONS = ['start', 'concepts', 'tutorials', 'api', 'editors', 'reference'];
pages.sort(
  (a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.order - b.order,
);

await mkdir(out, { recursive: true });
// Copied, not stamped: a picture whose bytes have not changed is not written again, for the same
// reason as the index below.
let copied = 0;
for (const [rel, src] of pictures) {
  const dest = resolve(out, 'img', rel);
  await mkdir(dirname(dest), { recursive: true });
  const [was, now] = await Promise.all([readFile(dest).catch(() => null), readFile(src)]);
  if (was && was.equals(now)) {
    continue;
  }
  await copyFile(src, dest);
  copied += 1;
}
const file = resolve(out, 'index.json');
const built = JSON.stringify({ pages, manifest: { namespaces, index } });
// Written only when it differs: the dev server watches this directory while the e2e suite runs
// against it.
const current = await readFile(file, 'utf8').catch(() => null);
if (current !== built) {
  await writeFile(file, built);
}
console.warn(
  `docs-build: ${pages.length} pages, ${Object.keys(index).length} api entries, ${pictures.size} pictures (${copied} copied) → ${relative(root, out)}/`,
);
