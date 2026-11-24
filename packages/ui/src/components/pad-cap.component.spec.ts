import { render } from '@testing-library/angular';

import {
  padCapCells,
  PadCapComponent,
  type PadCapKind,
  type PadDirection,
} from './pad-cap.component';

const draw = async (kind: PadCapKind, direction: PadDirection): Promise<SVGSVGElement | null> => {
  const { container } = await render(PadCapComponent, { inputs: { kind, direction } });
  return container.querySelector('svg');
};

const inked = (rows: string[]): [number, number][] =>
  rows.flatMap((row, y) =>
    Array.from(row, (cell, x) => [cell, x] as const).flatMap(([cell, x]) =>
      cell === 'i' ? [[x, y] as [number, number]] : [],
    ),
  );

describe('PadCapComponent', () => {
  it('draws the D-pad 42px high on the kit pixel, hidden from screen readers', async () => {
    const svg = await draw('dpad', 'left');
    expect(svg).toHaveAttribute('viewBox', '0 0 13 14');
    expect(svg).toHaveAttribute('width', '39');
    expect(svg).toHaveAttribute('height', '42');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it.each(['dpad', 'stick'] as const)('paints the %s only with theme tokens', async (kind) => {
    const svg = await draw(kind, 'up');
    const fills = [...(svg?.querySelectorAll('rect') ?? [])].map((rect) =>
      rect.getAttribute('fill'),
    );
    expect(fills.length).toBeGreaterThan(0);
    for (const fill of fills) {
      expect(fill).toMatch(/^var\(--color-(key|primary)[\w-]*\)$/);
    }
  });

  it('inks a three-by-two triangle a cell inside the tip of the pressed arm', () => {
    expect(inked(padCapCells('dpad', 'left'))).toEqual([
      [3, 5],
      [2, 6],
      [3, 6],
      [3, 7],
    ]);
    expect(inked(padCapCells('dpad', 'up'))).toEqual([
      [6, 2],
      [5, 3],
      [6, 3],
      [7, 3],
    ]);
    expect(inked(padCapCells('dpad', 'down'))).toEqual([
      [5, 9],
      [6, 9],
      [7, 9],
      [6, 10],
    ]);
  });

  it("cuts each tip by a cell at its corners, and keeps a face above the lower arm's shade", () => {
    const rows = padCapCells('dpad', 'right');
    expect(rows[0]).toBe('....eeeee....');
    expect(rows.at(-1)).toBe('....eeeee....');
    expect(rows[10]).toMatch(/^\.\.\.ef+e\.\.\.$/);
    expect(rows[11]).toBe('...essssse...');
  });

  it("moves the stick's knob toward its direction", () => {
    const knob = (direction: PadDirection): number =>
      padCapCells('stick', direction).findIndex((row) => row.includes('k'));
    const column = (direction: PadDirection): number =>
      Math.min(
        ...padCapCells('stick', direction)
          .map((row) => row.indexOf('k'))
          .filter((x) => x >= 0),
      );
    expect(knob('up')).toBeLessThan(knob('down'));
    expect(column('left')).toBeLessThan(column('right'));
  });
});
