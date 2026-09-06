import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ArtStore } from './art.store';
import { toolBounds, withinBounds } from './sprite-canvas.component';

/**
 * The canvas draws all 128×128 now, so nothing about what you can see says what you may paint.
 * The lock is the only thing that does, and it is arithmetic — the drawing itself needs a 2d
 * context the test environment has not got, so the rule is tested where it is decided.
 */
describe('tool bounds', () => {
  const region = { x: 2, y: 3, w: 2, h: 1 };

  it('holds a tool to the region while the lock is on', () => {
    const b = toolBounds(region, true);
    expect(b).toEqual({ x: 16, y: 24, w: 16, h: 8 });
    expect(withinBounds(b, { x: 16, y: 24 })).toBe(true);
    expect(withinBounds(b, { x: 31, y: 31 })).toBe(true);
    // One pixel past each edge, which is where a stroke leaves the sprite it belongs to.
    expect(withinBounds(b, { x: 15, y: 24 })).toBe(false);
    expect(withinBounds(b, { x: 32, y: 24 })).toBe(false);
    expect(withinBounds(b, { x: 16, y: 32 })).toBe(false);
  });

  it('opens the whole sheet once the lock is off, and no further', () => {
    const b = toolBounds(region, false);
    expect(b).toEqual({ x: 0, y: 0, w: 128, h: 128 });
    expect(withinBounds(b, { x: 15, y: 24 })).toBe(true);
    expect(withinBounds(b, { x: 127, y: 127 })).toBe(true);
    expect(withinBounds(b, { x: 128, y: 0 })).toBe(false);
    expect(withinBounds(b, { x: -1, y: 0 })).toBe(false);
  });
});

/** A region is dragged by its corners in the sheet map, so it arrives inverted and out of bounds. */
describe('ArtStore region', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ArtStore] });
  });

  it('keeps a dragged region whole and on the sheet', () => {
    const store = TestBed.inject(ArtStore);

    store.setRegion({ x: 14, y: 0, w: 8, h: 1 });
    expect(store.region()).toEqual({ x: 8, y: 0, w: 8, h: 1 });

    store.setRegion({ x: -3, y: -1, w: 2, h: 2 });
    expect(store.region()).toEqual({ x: 0, y: 0, w: 2, h: 2 });

    store.setRegion({ x: 0, y: 0, w: 0, h: 99 });
    expect(store.region()).toEqual({ x: 0, y: 0, w: 1, h: 16 });
  });

  it('names the region by its first cell', () => {
    const store = TestBed.inject(ArtStore);
    store.setRegion({ x: 3, y: 2, w: 2, h: 2 });
    expect(store.sprite()).toBe(35);
  });

  it('drops a selection when the region moves, so it cannot outlive what it was drawn in', () => {
    const store = TestBed.inject(ArtStore);
    store.setSelection({ x: 8, y: 8, w: 4, h: 4 });
    store.setRegion({ x: 5, y: 5, w: 1, h: 1 });
    expect(store.selection()).toBeNull();
  });
});
