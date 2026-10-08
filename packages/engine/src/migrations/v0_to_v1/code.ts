import luaparse from 'luaparse';
import type * as Y from 'yjs';

import { applySplices, type Splice } from '../splice';
import type { MigrationReport } from '../types';
import { V0_GLOBALS } from './globals';

interface AnyNode {
  type: string;
  range?: [number, number];
  loc?: { start: { line: number } };
  [key: string]: unknown;
}

const isNode = (value: unknown): value is AnyNode =>
  typeof value === 'object' && value !== null && typeof (value as AnyNode).type === 'string';

/** Above this, a file is renamed token by token rather than parsed. */
const PARSE_LIMIT = 200_000;

const lineOf = (source: string, at: number): number => source.slice(0, at).split('\n').length;

/**
 * Rewrites v0 global calls (sprite(...), key_pressed(...), …) into their namespaced form using the
 * luaparse AST, preserving every argument's original text. Returns splices in ascending order, or
 * null when the code cannot be parsed (the token fallback then applies).
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
  } catch {
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
      if (V0_GLOBALS.has(name)) {
        redefined.add(name);
      }
    }
    if (node.type === 'AssignmentStatement') {
      for (const variable of node.variables as unknown[]) {
        if (
          isNode(variable) &&
          variable.type === 'Identifier' &&
          variable.isLocal !== true &&
          V0_GLOBALS.has(String(variable.name))
        ) {
          redefined.add(String(variable.name));
        }
      }
    }
  });
  for (const name of redefined) {
    report.warnings.push({
      step: 'code',
      file,
      message: `"${name}" is redefined by the game; its calls were left unchanged`,
    });
  }

  // Pass 2: rewrite.
  const splices: Splice[] = [];
  const handled = new Set<AnyNode>();
  walk(chunk, (node, parent) => {
    if (node.type === 'Identifier' && node.isLocal !== true) {
      const name = String(node.name);
      const entry = V0_GLOBALS.get(name);
      if (!entry || redefined.has(name) || handled.has(node)) {
        return;
      }
      if (!node.range) {
        return;
      }
      // Skip member names (a.sprite), table keys ({sprite=1}) and declarations.
      if (parent && isMemberName(parent, node)) {
        return;
      }
      const { target, argOrder } = entry;
      if (parent?.type === 'CallExpression' && parent.base === node && argOrder) {
        const args = parent.arguments as AnyNode[];
        if (!parent.range || args.some((arg) => !arg.range) || hasMultiValueTail(args)) {
          report.warnings.push({
            step: 'code',
            file,
            line: node.loc?.start.line,
            message: `${name}(...) passes a variable argument list, so its arguments cannot be reordered for ${target}; rewrite it by hand`,
          });
          return;
        }
        const texts = args.map((arg) => source.slice(arg.range?.[0] ?? 0, arg.range?.[1] ?? 0));
        const reordered = argOrder
          .map((i) => texts[i])
          .filter((text): text is string => text !== undefined);
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
  for (const splice of splices) {
    if (splice.start < lastEnd) {
      continue;
    }
    out.push(splice);
    lastEnd = splice.end;
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
    if (key === 'loc' || key === 'range' || key === 'globals') {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) {
          walk(child, visit, node);
        }
      }
    } else if (isNode(value)) {
      walk(value, visit, node);
    }
  }
}

/**
 * Token-level fallback for code that does not parse or is too large to: renames the calls whose
 * arguments keep their order, and warns on the line of each one that would need reordering.
 */
export function computeTokenSplices(
  source: string,
  report: MigrationReport,
  file = 'main.lua',
): Splice[] {
  const splices: Splice[] = [];
  const re = /(^|[^\w.:])([A-Za-z_]\w*)(\s*)(?=[({"'[])/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const name = match[2] ?? '';
    const entry = V0_GLOBALS.get(name);
    if (!entry) {
      continue;
    }
    const before = source.slice(0, match.index + (match[1] ?? '').length);
    if (/\b(function|local)\s*$/.test(before)) {
      continue;
    }
    const start = match.index + (match[1] ?? '').length;
    if (entry.argOrder) {
      report.warnings.push({
        step: 'code',
        file,
        line: lineOf(source, start),
        message: `${name}(...) takes its arguments in another order as ${entry.target}, which cannot be worked out in a file that does not parse; rewrite it by hand`,
      });
      continue;
    }
    splices.push({ start, end: start + name.length, text: entry.target });
  }
  return splices;
}

export function migrateCode(text: Y.Text, report: MigrationReport, file = 'main.lua'): void {
  const source = text.toString();
  const parsed = source.length > PARSE_LIMIT ? null : computeCodeSplices(source, report, file);
  const splices = parsed ?? computeTokenSplices(source, report, file);
  report.counts[`rewrites:${file}`] = applySplices(text, splices);
}
