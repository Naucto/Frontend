import luaparse from 'luaparse';
import type * as Y from 'yjs';

import { LEGACY_ALIASES, type LuaApiEntry } from '../../api/luaApiTable';
import type { MigrationReport } from '../types';

interface Splice {
  start: number;
  end: number;
  text: string;
}

interface AnyNode {
  type: string;
  range?: [number, number];
  loc?: { start: { line: number } };
  [k: string]: unknown;
}

const isNode = (v: unknown): v is AnyNode =>
  typeof v === 'object' && v !== null && typeof (v as AnyNode).type === 'string';

/**
 * Rewrites legacy global calls (sprite(...), key_pressed(...), …) into their
 * namespaced form using the luaparse AST, preserving every argument's original
 * text. Returns splices in ascending order, or null when the code cannot be
 * parsed (the token fallback then applies).
 */
export function computeCodeSplices(
  source: string,
  report: MigrationReport,
  file = 'main.lua',
): Splice[] | null {
  let chunk: AnyNode;
  try {
    chunk = luaparse.parse(source, {
      luaVersion: '5.3',
      ranges: true,
      locations: true,
      scope: true,
      comments: false,
    }) as unknown as AnyNode;
  } catch (e) {
    report.warnings.push({
      step: 'code',
      file,
      message: `could not parse: ${e instanceof Error ? e.message : String(e)}; runtime compatibility layer kept`,
    });
    return null;
  }

  // Pass 1: globals the user defines themselves stay untouched.
  const redefined = new Set<string>();
  walk(chunk, (node) => {
    if (
      node.type === 'FunctionDeclaration' &&
      isNode(node.identifier) &&
      node.identifier.type === 'Identifier' &&
      node.isLocal !== true
    ) {
      const name = String(node.identifier.name);
      if (LEGACY_ALIASES.has(name)) redefined.add(name);
    }
    if (node.type === 'AssignmentStatement') {
      for (const v of node.variables as unknown[]) {
        if (
          isNode(v) &&
          v.type === 'Identifier' &&
          v.isLocal !== true &&
          LEGACY_ALIASES.has(String(v.name))
        )
          redefined.add(String(v.name));
      }
    }
  });
  for (const name of redefined)
    report.warnings.push({
      step: 'code',
      file,
      message: `"${name}" is redefined by the game; its calls were left unchanged`,
    });

  // Pass 2: rewrite.
  const splices: Splice[] = [];
  const handled = new Set<AnyNode>();
  walk(chunk, (node, parent) => {
    if (node.type === 'Identifier' && node.isLocal !== true) {
      const name = String(node.name);
      const entry = LEGACY_ALIASES.get(name);
      if (!entry || redefined.has(name) || handled.has(node)) return;
      if (!node.range) return;
      // Skip member names (a.sprite), table keys ({sprite=1}) and declarations.
      if (parent && isMemberName(parent, node)) return;
      const target = `${entry.ns}.${entry.name}`;
      if (parent?.type === 'CallExpression' && parent.base === node && entry.legacyArgOrder) {
        const args = parent.arguments as AnyNode[];
        if (!parent.range || args.some((a) => !a.range) || hasMultiValueTail(args)) {
          report.warnings.push({
            step: 'code',
            file,
            line: node.loc?.start.line,
            message: `${name}(...) uses a variable argument list; left for the compatibility layer`,
          });
          return;
        }
        const texts = args.map((a) => source.slice(a.range?.[0] ?? 0, a.range?.[1] ?? 0));
        const reordered = entry.legacyArgOrder
          .map((i) => texts[i])
          .filter((t): t is string => t !== undefined);
        splices.push({
          start: parent.range[0],
          end: parent.range[1],
          text: `${target}(${reordered.join(', ')})`,
        });
        handled.add(node);
        return;
      }
      splices.push({ start: node.range[0], end: node.range[1], text: target });
      handled.add(node);
    }
  });
  splices.sort((a, b) => a.start - b.start);
  // Drop nested splices (an argument rewritten inside an already-rewritten call).
  const out: Splice[] = [];
  let lastEnd = -1;
  for (const s of splices) {
    if (s.start < lastEnd) continue;
    out.push(s);
    lastEnd = s.end;
  }
  return out;
}

const isMemberName = (parent: AnyNode, node: AnyNode): boolean =>
  (parent.type === 'MemberExpression' && parent.identifier === node) ||
  (parent.type === 'TableKeyString' && parent.key === node) ||
  (parent.type === 'LocalStatement' && (parent.variables as unknown[]).includes(node)) ||
  (parent.type === 'FunctionDeclaration' &&
    (parent.identifier === node || (parent.parameters as unknown[]).includes(node)));

const hasMultiValueTail = (args: AnyNode[]): boolean => {
  const last = args[args.length - 1];
  return (
    !!last &&
    (last.type === 'CallExpression' ||
      last.type === 'StringCallExpression' ||
      last.type === 'TableCallExpression' ||
      last.type === 'VarargLiteral')
  );
};

function walk(
  node: AnyNode,
  visit: (node: AnyNode, parent: AnyNode | null) => void,
  parent: AnyNode | null = null,
): void {
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'globals') continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const c of v) if (isNode(c)) walk(c, visit, node);
    } else if (isNode(v)) {
      walk(v, visit, node);
    }
  }
}

/** Token-level fallback for unparsable code: rename bare legacy calls, no argument reordering. */
export function computeTokenSplices(
  source: string,
  report: MigrationReport,
  file = 'main.lua',
): Splice[] {
  const splices: Splice[] = [];
  const re = /(^|[^\w.:])([A-Za-z_]\w*)(\s*)(?=[({"'[])/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const name = m[2] ?? '';
    const entry: LuaApiEntry | undefined = LEGACY_ALIASES.get(name);
    if (!entry) continue;
    const before = source.slice(0, m.index + (m[1] ?? '').length);
    if (/\b(function|local)\s*$/.test(before)) continue;
    if (entry.legacyArgOrder) {
      report.warnings.push({
        step: 'code',
        file,
        message: `${name}(...) kept as-is (argument order differs and the file has syntax errors)`,
      });
      continue;
    }
    const start = m.index + (m[1] ?? '').length;
    splices.push({ start, end: start + name.length, text: `${entry.ns}.${entry.name}` });
  }
  return splices;
}

/** Applies splices to a Y.Text from the end so earlier offsets stay valid. */
export function applySplices(text: Y.Text, splices: Splice[]): number {
  for (let i = splices.length - 1; i >= 0; i--) {
    const s = splices[i];
    if (!s) continue;
    text.delete(s.start, s.end - s.start);
    text.insert(s.start, s.text);
  }
  return splices.length;
}

export function migrateCode(text: Y.Text, report: MigrationReport, file = 'main.lua'): void {
  const source = text.toString();
  if (source.length > 200_000) {
    report.warnings.push({
      step: 'code',
      file,
      message: 'file larger than 200 KB; left for the compatibility layer',
    });
    return;
  }
  const splices =
    computeCodeSplices(source, report, file) ?? computeTokenSplices(source, report, file);
  report.counts[`rewrites:${file}`] = applySplices(text, splices);
}
