export type DockSide = 'left' | 'right' | 'top' | 'bottom';
export type DockZone = DockSide | 'tab';

export interface DockLeaf<W extends string> {
  kind: 'leaf';
  id: string;
  tabs: W[];
  active: W;
}

export interface DockSplit<W extends string> {
  kind: 'split';
  id: string;
  direction: 'row' | 'column';
  ratio: number;
  first: DockNode<W>;
  second: DockNode<W>;
}

export type DockNode<W extends string> = DockLeaf<W> | DockSplit<W>;

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

export interface DockLayout<W extends string> {
  root: DockNode<W> | null;
  floats: Partial<Record<W, DockFloat>>;
  nextId: number;
  nextZ: number;
}

const MIN_RATIO = 0.1;

export function baseLayout<W extends string>(order: readonly W[], active?: W): DockLayout<W> {
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

export function leaves<W extends string>(node: DockNode<W> | null): DockLeaf<W>[] {
  if (!node) {
    return [];
  }

  return node.kind === 'leaf' ? [node] : [...leaves(node.first), ...leaves(node.second)];
}

export function findNode<W extends string>(
  node: DockNode<W> | null,
  id: string,
): DockNode<W> | null {
  if (!node) {
    return null;
  }
  if (node.id === id) {
    return node;
  }

  return node.kind === 'split' ? (findNode(node.first, id) ?? findNode(node.second, id)) : null;
}

export const leafOf = <W extends string>(layout: DockLayout<W>, window: W): DockLeaf<W> | null =>
  leaves(layout.root).find((leaf) => leaf.tabs.includes(window)) ?? null;

export const floatingWindows = <W extends string>(layout: DockLayout<W>): W[] =>
  Object.keys(layout.floats) as W[];

export const visibleCount = <W extends string>(layout: DockLayout<W>): number =>
  leaves(layout.root).length + floatingWindows(layout).length;

function mapNode<W extends string>(
  node: DockNode<W> | null,
  visit: (leaf: DockLeaf<W>) => DockNode<W> | null,
): DockNode<W> | null {
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

function withoutWindow<W extends string>(layout: DockLayout<W>, window: W): DockLayout<W> {
  const floats = Object.fromEntries(
    Object.entries(layout.floats).filter(([key]) => key !== window),
  ) as Partial<Record<W, DockFloat>>;
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

export function popOut<W extends string>(
  layout: DockLayout<W>,
  window: W,
  rect: DockRect,
): DockLayout<W> {
  const from = leafOf(layout, window)?.id ?? null;
  const next = withoutWindow(layout, window);

  return {
    ...next,
    floats: { ...next.floats, [window]: { ...rect, z: next.nextZ, from } },
    nextZ: next.nextZ + 1,
  };
}

export function moveFloat<W extends string>(
  layout: DockLayout<W>,
  window: W,
  rect: DockRect,
): DockLayout<W> {
  const current = layout.floats[window];
  if (!current) {
    return layout;
  }

  return { ...layout, floats: { ...layout.floats, [window]: { ...current, ...rect } } };
}

export function dock<W extends string>(
  layout: DockLayout<W>,
  window: W,
  targetId: string | null,
  zone: DockZone,
  index?: number,
  share = 0.5,
): DockLayout<W> {
  const next = withoutWindow(layout, window);
  const target = targetId === null ? null : findNode(next.root, targetId);
  const leaf: DockLeaf<W> = {
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

function splitAround<W extends string>(
  layout: DockLayout<W>,
  target: DockNode<W>,
  leaf: DockLeaf<W>,
  side: DockSide,
  share: number,
): DockLayout<W> {
  const before = side === 'left' || side === 'top';
  const split: DockSplit<W> = {
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

function replaceNode<W extends string>(
  node: DockNode<W>,
  id: string,
  replacement: DockNode<W>,
): DockNode<W> {
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

export function dockBack<W extends string>(layout: DockLayout<W>, window: W): DockLayout<W> {
  const from = layout.floats[window]?.from ?? null;
  const home = from === null ? null : findNode(layout.root, from);
  const target = home?.kind === 'leaf' ? home : (leaves(layout.root)[0] ?? null);

  return dock(layout, window, target?.id ?? null, 'tab');
}

export function focus<W extends string>(layout: DockLayout<W>, window: W): DockLayout<W> {
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

export function resize<W extends string>(
  layout: DockLayout<W>,
  splitId: string,
  ratio: number,
): DockLayout<W> {
  const split = findNode(layout.root, splitId);
  if (!layout.root || split?.kind !== 'split') {
    return layout;
  }
  const clamped = Math.max(MIN_RATIO, Math.min(1 - MIN_RATIO, ratio));

  return { ...layout, root: replaceNode(layout.root, splitId, { ...split, ratio: clamped }) };
}

export function measure<W extends string>(
  node: DockNode<W> | null,
  rect: DockRect,
): Map<string, DockRect> {
  const out = new Map<string, DockRect>();
  const walk = (current: DockNode<W>, area: DockRect): void => {
    out.set(current.id, area);
    if (current.kind === 'leaf') {
      return;
    }
    if (current.direction === 'row') {
      const width = area.width * current.ratio;
      walk(current.first, { ...area, width });
      walk(current.second, { ...area, x: area.x + width, width: area.width - width });
    } else {
      const height = area.height * current.ratio;
      walk(current.first, { ...area, height });
      walk(current.second, { ...area, y: area.y + height, height: area.height - height });
    }
  };
  if (node) {
    walk(node, rect);
  }

  return out;
}

export function fits<W extends string>(
  layout: DockLayout<W>,
  rect: DockRect,
  min: { width: number; height: number },
): boolean {
  const areas = measure(layout.root, rect);

  return leaves(layout.root).every((leaf) => {
    const area = areas.get(leaf.id);

    return !area || (area.width >= min.width && area.height >= min.height);
  });
}

export function isBaseLayout<W extends string>(
  layout: DockLayout<W>,
  order: readonly W[],
): boolean {
  const root = layout.root;

  return (
    floatingWindows(layout).length === 0 &&
    root?.kind === 'leaf' &&
    root.tabs.length === order.length &&
    root.tabs.every((tab, i) => tab === order[i])
  );
}
