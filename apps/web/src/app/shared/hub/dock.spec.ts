import { describe, expect, it } from 'vitest';

import { dockFits, dockPose, restPose } from './dock';

describe('dockFits', () => {
  it('counts the disks that stand a step apart inside the row', () => {
    expect(dockFits(264)).toBe(15);
    expect(dockFits(96)).toBe(1);
  });
});

describe('restPose', () => {
  it('stands the disks a step apart from the left, each over the one before', () => {
    expect(restPose(3, 6, false, 264)).toEqual({ left: 36, x: 0, y: 0, scale: 1, z: 4 });
  });

  it('spreads a large collection over the whole row', () => {
    expect(restPose(0, 16, true, 264).left).toBe(0);
    expect(restPose(8, 16, true, 264).left).toBe(84);
    expect(restPose(16, 16, true, 264).left).toBe(264 - 96);
  });
});

describe('dockPose', () => {
  it('puts the focused disk at the crown: centred, raised, a third larger, over the others', () => {
    expect(dockPose(2, 2, 264)).toEqual({ left: 84, x: 0, y: -44, scale: 1 + 1 / 3, z: 100 });
  });

  it('spaces the neighbours wide, the next ones tighter, and lowers them along the arc', () => {
    const near = dockPose(3, 2, 464);
    const far = dockPose(4, 2, 464);
    expect(near.x).toBe(80);
    expect(far.x).toBe(116);
    expect(near.scale).toBe(1);
    expect(far.y).toBeGreaterThan(near.y);
    expect(near.y).toBeGreaterThan(-44);
    expect(far.z).toBeLessThan(near.z);
  });

  it('mirrors the two sides of the crown', () => {
    expect(dockPose(1, 2, 464).x).toBe(-dockPose(3, 2, 464).x);
    expect(dockPose(1, 2, 464).y).toBe(dockPose(3, 2, 464).y);
  });

  it('goes no further out than the row leaves room for', () => {
    expect(dockPose(9, 0, 264).x).toBe(92);
    expect(dockPose(9, 0, 1000).x).toBe(220);
  });

  it('shares the crown between two disks while the dock is dragged from one to the other', () => {
    const leaving = dockPose(2, 2.5, 264);
    const arriving = dockPose(3, 2.5, 264);
    expect(leaving.scale).toBeCloseTo(1 + 0.5 / 3);
    expect(arriving.scale).toBeCloseTo(leaving.scale);
    expect(leaving.x).toBe(-arriving.x);
  });
});
