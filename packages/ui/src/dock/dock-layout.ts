export type DockSide = 'left' | 'right' | 'top' | 'bottom';
export type DockZone = DockSide | 'tab';

export interface DockLeaf {
  kind: 'leaf';
  id: string;
  tabs: string[];
  active: string;
}

interface DockSplit {
  kind: 'split';
  id: string;
  direction: 'row' | 'column';
  ratio: number;
  first: DockNode;
  second: DockNode;
}

export type DockNode = DockLeaf | DockSplit;

export interface DockRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DockFloat extends DockRect {
  z: number;
  from: string | null;
}

export interface DockLayout {
  root: DockNode | null;
  floats: Partial<Record<string, DockFloat>>;
  nextId: number;
  nextZ: number;
}

const MIN_RATIO = 0.1;

export function baseLayout(order: readonly string[], active?: string): DockLayout {
  const first = order[0];
  if (first === undefined) {
    return { root: null, floats: {}, nextId: 1, nextZ: 1 };
  }

  return {
    root: { kind: 'leaf', id: 'L0', tabs: [...order], active: active ?? first },
    floats: {},
    nextId: 1,
    nextZ: 1,
  };
}

export function leaves(node: DockNode | null): DockLeaf[] {
  if (!node) {
    return [];
  }

  return node.kind === 'leaf' ? [node] : [...leaves(node.first), ...leaves(node.second)];
}

function findNode(node: DockNode | null, id: string): DockNode | null {
  if (!node) {
    return null;
  }
  if (node.id === id) {
    return node;
  }

  return node.kind === 'split' ? (findNode(node.first, id) ?? findNode(node.second, id)) : null;
}

export const leafOf = (layout: DockLayout, window: string): DockLeaf | null =>
  leaves(layout.root).find((leaf) => leaf.tabs.includes(window)) ?? null;

export const floatingWindows = (layout: DockLayout): string[] => Object.keys(layout.floats);

export const visibleCount = (layout: DockLayout): number =>
  leaves(layout.root).length + floatingWindows(layout).length;

function mapNode(
  node: DockNode | null,
  visit: (leaf: DockLeaf) => DockNode | null,
): DockNode | null {
  if (!node) {
    return null;
  }
  if (node.kind === 'leaf') {
    return visit(node);
  }
  const first = mapNode(node.first, visit);
  const second = mapNode(node.second, visit);
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }

  return { ...node, first, second };
}

function withoutWindow(layout: DockLayout, window: string): DockLayout {
  const floats = Object.fromEntries(
    Object.entries(layout.floats).filter(([key]) => key !== window),
  ) as Partial<Record<string, DockFloat>>;
  const root = mapNode(layout.root, (leaf) => {
    if (!leaf.tabs.includes(window)) {
      return leaf;
    }
    const tabs = leaf.tabs.filter((tab) => tab !== window);
    const first = tabs[0];
    if (first === undefined) {
      return null;
    }

    return { ...leaf, tabs, active: leaf.active === window ? first : leaf.active };
  });

  return { ...layout, root, floats };
}

export function popOut(layout: DockLayout, window: string, rect: DockRect): DockLayout {
  const from = leafOf(layout, window)?.id ?? null;
  const next = withoutWindow(layout, window);

  return {
    ...next,
    floats: { ...next.floats, [window]: { ...rect, z: next.nextZ, from } },
    nextZ: next.nextZ + 1,
  };
}

export function moveFloat(layout: DockLayout, window: string, rect: DockRect): DockLayout {
  const current = layout.floats[window];
  if (!current) {
    return layout;
  }

  return { ...layout, floats: { ...layout.floats, [window]: { ...current, ...rect } } };
}

export function dock(
  layout: DockLayout,
  window: string,
  targetId: string | null,
  zone: DockZone,
  index?: number,
  share = 0.5,
): DockLayout {
  const next = withoutWindow(layout, window);
  const target = targetId === null ? null : findNode(next.root, targetId);
  const leaf: DockLeaf = {
    kind: 'leaf',
    id: `L${String(next.nextId)}`,
    tabs: [window],
    active: window,
  };
  if (!next.root || !target) {
    if (!next.root) {
      return { ...next, root: leaf, nextId: next.nextId + 1 };
    }
    if (zone === 'tab') {
      return next;
    }

    return splitAround(next, next.root, leaf, zone, share);
  }
  if (zone === 'tab') {
    if (target.kind !== 'leaf') {
      return next;
    }
    const tabs = [...target.tabs];
    tabs.splice(Math.max(0, Math.min(index ?? tabs.length, tabs.length)), 0, window);

    return {
      ...next,
      root: replaceNode(next.root, target.id, { ...target, tabs, active: window }),
    };
  }

  return splitAround(next, target, leaf, zone, share);
}

function splitAround(
  layout: DockLayout,
  target: DockNode,
  leaf: DockLeaf,
  side: DockSide,
  share: number,
): DockLayout {
  const before = side === 'left' || side === 'top';
  const split: DockSplit = {
    kind: 'split',
    id: `S${String(layout.nextId + 1)}`,
    direction: side === 'left' || side === 'right' ? 'row' : 'column',
    ratio: before ? share : 1 - share,
    first: before ? leaf : target,
    second: before ? target : leaf,
  };

  return {
    ...layout,
    root: layout.root ? replaceNode(layout.root, target.id, split) : split,
    nextId: layout.nextId + 2,
  };
}

function replaceNode(node: DockNode, id: string, replacement: DockNode): DockNode {
  if (node.id === id) {
    return replacement;
  }
  if (node.kind === 'leaf') {
    return node;
  }

  return {
    ...node,
    first: replaceNode(node.first, id, replacement),
    second: replaceNode(node.second, id, replacement),
  };
}

export function dockBack(layout: DockLayout, window: string): DockLayout {
  const from = layout.floats[window]?.from ?? null;
  const home = from === null ? null : findNode(layout.root, from);
  const target = home?.kind === 'leaf' ? home : (leaves(layout.root)[0] ?? null);

  return dock(layout, window, target?.id ?? null, 'tab');
}

export function focus(layout: DockLayout, window: string): DockLayout {
  const float = layout.floats[window];
  if (float) {
    return {
      ...layout,
      floats: { ...layout.floats, [window]: { ...float, z: layout.nextZ } },
      nextZ: layout.nextZ + 1,
    };
  }
  const leaf = leafOf(layout, window);
  if (!leaf || leaf.active === window || !layout.root) {
    return layout;
  }

  return { ...layout, root: replaceNode(layout.root, leaf.id, { ...leaf, active: window }) };
}

export function resize(layout: DockLayout, splitId: string, ratio: number): DockLayout {
  const split = findNode(layout.root, splitId);
  if (!layout.root || split?.kind !== 'split') {
    return layout;
  }
  const clamped = Math.max(MIN_RATIO, Math.min(1 - MIN_RATIO, ratio));

  return { ...layout, root: replaceNode(layout.root, splitId, { ...split, ratio: clamped }) };
}

/** Whether every zone of the layout keeps its minimum size inside `rect`. */
export function fits(
  layout: DockLayout,
  rect: DockRect,
  min: { width: number; height: number },
): boolean {
  const walk = (node: DockNode, area: DockRect): boolean => {
    if (node.kind === 'leaf') {
      return area.width >= min.width && area.height >= min.height;
    }
    if (node.direction === 'row') {
      const width = area.width * node.ratio;
      return (
        walk(node.first, { ...area, width }) &&
        walk(node.second, { ...area, x: area.x + width, width: area.width - width })
      );
    }
    const height = area.height * node.ratio;
    return (
      walk(node.first, { ...area, height }) &&
      walk(node.second, { ...area, y: area.y + height, height: area.height - height })
    );
  };
  return !layout.root || walk(layout.root, rect);
}

export function isBaseLayout(layout: DockLayout, order: readonly string[]): boolean {
  const root = layout.root;

  return (
    floatingWindows(layout).length === 0 &&
    root?.kind === 'leaf' &&
    root.tabs.length === order.length &&
    root.tabs.every((tab, i) => tab === order[i])
  );
}
