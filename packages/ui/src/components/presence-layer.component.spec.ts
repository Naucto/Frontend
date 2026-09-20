import { describe, expect, it } from 'vitest';

import { place, type PresenceMark } from './presence-layer.component';

const mark = (x: number, y: number): PresenceMark => ({
  id: 1,
  name: 'ada',
  colour: 'sky',
  x,
  y,
});
const frame = { x: 100, y: 100, w: 400, h: 200 };

/**
 * The rule this component exists for: a peer outside the frame has to say which way they are,
 * because until now they said nothing at all — filtered out, or drawn somewhere nobody was
 * looking.
 */
describe('presence placement', () => {
  it('draws a peer inside the frame where they are', () => {
    expect(place(mark(200, 150), frame)).toMatchObject({ x: 200, y: 150, edge: null });
  });

  it('draws every peer as a cursor when the whole surface is on screen', () => {
    expect(place(mark(9999, 9999), null).edge).toBeNull();
  });

  it('keeps the frame edges themselves inside', () => {
    // Top-left corner is in; one past the far edge is out, on both axes.
    expect(place(mark(100, 100), frame).edge).toBeNull();
    expect(place(mark(499, 299), frame).edge).toBeNull();
    expect(place(mark(500, 200), frame).edge).toBe('right');
    expect(place(mark(300, 300), frame).edge).toBe('down');
  });

  it('puts a peer beyond the frame on its rim, on the way to them', () => {
    const p = place(mark(900, 200), frame);
    expect(p.edge).toBe('right');
    // Dead level with the middle of the frame, and short of its right edge by the chip's width.
    expect(p.y).toBe(200);
    expect(p.x).toBe(454);
  });

  it('names the side by whichever offset is larger, not by which edge was crossed first', () => {
    // Far up and a little right: the chip belongs on the top rim.
    expect(place(mark(520, -600), frame).edge).toBe('up');
    expect(place(mark(-600, 120), frame).edge).toBe('left');
  });

  it('collapses to the middle rather than outside when the frame is too small for a chip', () => {
    const tiny = { x: 0, y: 0, w: 20, h: 20 };
    const p = place(mark(500, 10), tiny);
    expect(p.x).toBe(10);
    expect(p.y).toBe(10);
  });
});
