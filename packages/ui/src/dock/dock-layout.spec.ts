import {
  baseLayout,
  dock,
  dockBack,
  type DockLayout,
  type DockNode,
  fits,
  focus,
  isBaseLayout,
  leafOf,
  leaves,
  popOut,
  resize,
  visibleCount,
} from './dock-layout';

type Win = 'timeline' | 'patterns' | 'instruments' | 'sfx';

const ORDER: Win[] = ['timeline', 'patterns', 'instruments', 'sfx'];
const RECT = { x: 40, y: 40, width: 600, height: 400 };

const shape = (node: DockNode | null): unknown =>
  !node
    ? null
    : node.kind === 'leaf'
      ? node.tabs
      : { [node.direction]: [shape(node.first), shape(node.second)] };

const rootId = (layout: DockLayout): string => layout.root?.id ?? '';

describe('dock layout', () => {
  it('starts as one leaf holding every window, the chosen one in front', () => {
    const layout = baseLayout(ORDER, 'patterns');
    expect(shape(layout.root)).toEqual(ORDER);
    expect(leafOf(layout, 'sfx')?.active).toBe('patterns');
    expect(visibleCount(layout)).toBe(1);
  });

  it('pops a window out and puts it back in the leaf it came from', () => {
    const out = popOut(baseLayout(ORDER, 'patterns'), 'patterns', RECT);
    expect(shape(out.root)).toEqual(['timeline', 'instruments', 'sfx']);
    expect(leafOf(out, 'timeline')?.active).toBe('timeline');
    expect(out.floats.patterns).toMatchObject({ ...RECT, from: 'L0' });
    expect(visibleCount(out)).toBe(2);

    const back = dockBack(out, 'patterns');
    expect(back.floats.patterns).toBeUndefined();
    expect(shape(back.root)).toEqual(['timeline', 'instruments', 'sfx', 'patterns']);
    expect(leafOf(back, 'patterns')?.active).toBe('patterns');
  });

  it('splits a leaf on the side a window is dropped on', () => {
    const layout = baseLayout(ORDER);
    const right = dock(layout, 'sfx', rootId(layout), 'right');
    expect(shape(right.root)).toEqual({
      row: [['timeline', 'patterns', 'instruments'], ['sfx']],
    });

    const top = dock(right, 'instruments', leafOf(right, 'sfx')?.id ?? null, 'top');
    expect(shape(top.root)).toEqual({
      row: [['timeline', 'patterns'], { column: [['instruments'], ['sfx']] }],
    });
  });

  it('spans the whole workspace when dropped on its edge', () => {
    const layout = baseLayout(ORDER);
    const split = dock(layout, 'sfx', rootId(layout), 'right');
    const edge = dock(split, 'timeline', rootId(split), 'bottom');
    expect(shape(edge.root)).toEqual({
      column: [{ row: [['patterns', 'instruments'], ['sfx']] }, ['timeline']],
    });
  });

  it('inserts a tab where it is dropped and drops a leaf left empty', () => {
    const layout = baseLayout(ORDER);
    const split = dock(layout, 'sfx', rootId(layout), 'right');
    const target = leafOf(split, 'timeline')?.id ?? null;
    const moved = dock(split, 'sfx', target, 'tab', 1);
    expect(shape(moved.root)).toEqual(['timeline', 'sfx', 'patterns', 'instruments']);
    expect(leaves(moved.root)).toHaveLength(1);
  });

  it('docks into an empty workspace when every window was out', () => {
    let layout = baseLayout(['timeline', 'patterns']);
    layout = popOut(layout, 'timeline', RECT);
    layout = popOut(layout, 'patterns', RECT);
    expect(layout.root).toBeNull();
    layout = dockBack(layout, 'patterns');
    expect(shape(layout.root)).toEqual(['patterns']);
  });

  it('brings a floating window above the others and a tab to the front', () => {
    let layout = popOut(baseLayout(ORDER), 'sfx', RECT);
    layout = popOut(layout, 'timeline', RECT);
    const raised = focus(layout, 'sfx');
    expect(raised.floats.sfx?.z).toBeGreaterThan(raised.floats.timeline?.z ?? Infinity);
    expect(leafOf(focus(layout, 'instruments'), 'instruments')?.active).toBe('instruments');
  });

  it('keeps a resized split away from its edges', () => {
    const layout = baseLayout(ORDER);
    const split = dock(layout, 'sfx', rootId(layout), 'right');
    const id = rootId(split);
    const resized = resize(split, id, 0.99);
    expect(resized.root?.kind === 'split' ? resized.root.ratio : null).toBe(0.9);
  });

  it('says when a leaf would be smaller than the least a window needs', () => {
    const layout = baseLayout(ORDER);
    const split = dock(layout, 'sfx', rootId(layout), 'right');
    const area = { x: 0, y: 0, width: 1000, height: 600 };
    expect(fits(split, area, { width: 360, height: 280 })).toBe(true);
    expect(fits(split, { ...area, width: 700 }, { width: 360, height: 280 })).toBe(false);
  });

  it('knows the base view from any other', () => {
    const layout = baseLayout(ORDER, 'sfx');
    expect(isBaseLayout(layout, ORDER)).toBe(true);
    expect(isBaseLayout(popOut(layout, 'sfx', RECT), ORDER)).toBe(false);
    expect(isBaseLayout(dock(layout, 'sfx', rootId(layout), 'right'), ORDER)).toBe(false);
  });

  it('gives a window docked on an edge the share it is asked for', () => {
    const layout = baseLayout(ORDER);
    const edge = dock(layout, 'sfx', rootId(layout), 'right', undefined, 0.35);
    expect(edge.root?.kind === 'split' ? edge.root.ratio : null).toBe(0.65);
    const left = dock(layout, 'sfx', rootId(layout), 'left', undefined, 0.35);
    expect(left.root?.kind === 'split' ? left.root.ratio : null).toBe(0.35);
  });
});
