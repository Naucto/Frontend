import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { glyphRendering } from '../icons/rendering';

export type PadCapKind = 'dpad' | 'stick';
export type PadDirection = 'up' | 'down' | 'left' | 'right';

type Grid = string[][];
type Shape = (x: number, y: number) => boolean;

/** A drawing is rows of letters, one letter a kit pixel; `.` is left clear. */
const FILL: Record<string, string> = {
  e: 'var(--color-key-edge)',
  h: 'var(--color-key-hl)',
  f: 'var(--color-key-face)',
  s: 'var(--color-key-side)',
  i: 'var(--color-key-ink)',
  K: 'var(--color-primary-edge)',
  k: 'var(--color-primary)',
  j: 'var(--color-primary-skirt)',
};

/** The cross is seven cells thick, with three cells of arm on each side of its middle. */
const ARM = 3;
const THICK = 7;

/** The triangle at the tip of the pressed arm, pointing out of the cross. */
const POINTER: Record<PadDirection, string[]> = {
  left: ['.#', '##', '.#'],
  right: ['#.', '##', '#.'],
  up: ['.#.', '###'],
  down: ['###', '.#.'],
};

function blank(width: number, height: number): Grid {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => '.'));
}

/**
 * Lights a shape as `nc-keycap` is lit: a one-cell edge, a lit cell under each top edge, and
 * `depth` shaded cells over each lower edge. `keys` names the edge, lit, face and shade letters.
 */
function shade(grid: Grid, inside: Shape, depth: number, keys: string): void {
  const [edge = '.', lit = '.', face = '.', side = '.'] = keys;
  const isEdge = (x: number, y: number): boolean =>
    inside(x, y) &&
    (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1));
  for (const [y, row] of grid.entries()) {
    for (let x = 0; x < row.length; x++) {
      if (!inside(x, y)) {
        continue;
      }
      if (isEdge(x, y)) {
        row[x] = edge;
      } else if (isEdge(x, y - 1)) {
        row[x] = lit;
      } else if (Array.from({ length: depth }, (_, i) => i + 1).some((i) => isEdge(x, y + i))) {
        row[x] = side;
      } else {
        row[x] = face;
      }
    }
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number): Shape {
  return (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
}

/**
 * The D-pad as a key in the shape of a cross, its tips cut by a cell, shaded two cells deep so its
 * lower arm keeps a face above its shade, and a triangle inked a cell inside the pressed arm's tip.
 */
function crossCap(pressed: PadDirection): Grid {
  const width = THICK + 2 * ARM;
  const height = width + 1;
  const near = ARM;
  const far = ARM + THICK - 1;
  const grid = blank(width, height);
  const tip = (along: number, across: number): boolean =>
    !(along === 0 && (across === near || across === far));
  shade(
    grid,
    (x, y) => {
      const upright = x >= near && x <= far && y >= 0 && y < height;
      const across = y >= near && y <= far && x >= 0 && x < width;
      if (upright && y < near) {
        return tip(y, x);
      }
      if (upright && y > far) {
        return tip(height - 1 - y, x);
      }
      if (across && x < near) {
        return tip(x, y);
      }
      if (across && x > far) {
        return tip(width - 1 - x, y);
      }
      return upright || across;
    },
    2,
    'ehfs',
  );
  const pointer = POINTER[pressed];
  const tall = pointer.length;
  const wide = pointer[0]?.length ?? 0;
  const midX = Math.floor((near + far + 1 - wide) / 2);
  const midY = Math.floor((near + far + 1 - tall) / 2);
  const origin: Record<PadDirection, readonly [number, number]> = {
    left: [2, midY],
    right: [width - 2 - wide, midY],
    up: [midX, 2],
    down: [midX, height - 3 - tall],
  };
  const [ox, oy] = origin[pressed];
  for (const [y, line] of pointer.entries()) {
    for (let x = 0; x < line.length; x++) {
      const row = grid[oy + y];
      if (line[x] === '#' && row) {
        row[ox + x] = 'i';
      }
    }
  }
  return grid;
}

/**
 * A stick seen from the front: a round knob in the primary colour on a socket lit as a key, the
 * knob moved toward the direction and joined to the socket's hole by its shaft.
 */
function stickCap(toward: PadDirection): Grid {
  const width = 13;
  const grid = blank(width, 12);
  const mid = width / 2;
  const hole = 8;
  shade(grid, ellipse(mid, 9.5, 6.5, 2.5), 1, 'ehfs');
  const knob: Record<PadDirection, readonly [number, number]> = {
    left: [mid - 2, 4.5],
    right: [mid + 2, 4.5],
    up: [mid, 3.5],
    down: [mid, 5.5],
  };
  const [kx, ky] = knob[toward];
  grid[hole]?.fill('e', Math.floor(mid) - 1, Math.floor(mid) + 2);
  // The shaft, two cells thick, from the hole up to the knob's centre.
  const dx = kx - mid;
  const dy = ky - hole;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1) * 2;
  for (let i = 0; i <= steps; i++) {
    const x = mid - 0.5 + (dx * i) / steps;
    const y = Math.floor(hole + (dy * i) / steps);
    for (let k = 0; k < 2; k++) {
      const cells = grid[y];
      const column = Math.floor(x - 0.5 + k);
      if (cells && y < hole && column >= 0 && column < width) {
        cells[column] = 's';
      }
    }
  }
  shade(grid, ellipse(kx, ky, 3.5, 3.5), 1, 'eKkj');
  return grid;
}

/** The cells of a pad cap, a row of letters per kit pixel, for the template and the spec. */
export function padCapCells(kind: PadCapKind, direction: PadDirection): string[] {
  const grid = kind === 'dpad' ? crossCap(direction) : stickCap(direction);
  return grid.map((row) => row.join(''));
}

/**
 * A gamepad direction drawn as the control a player presses, to stand among `nc-keycap`s: the
 * D-pad as a key in the shape of a cross, the stick as a knob on its socket. Drawn on the kit
 * pixel at one size; the caller names the direction for screen readers.
 */
@Component({
  selector: 'nc-pad-cap',
  templateUrl: './pad-cap.component.html',
  host: { class: 'inline-flex h-(--nc-h-md) shrink-0 items-center' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PadCapComponent {
  readonly kind = input.required<PadCapKind>();
  readonly direction = input.required<PadDirection>();

  protected readonly rendering = glyphRendering;
  protected readonly cells = computed(() => padCapCells(this.kind(), this.direction()));
  /** Each row cut into runs of one colour, one rect a run. */
  protected readonly runs = computed(() =>
    this.cells().flatMap((row, y) => {
      const runs: { x: number; y: number; w: number; fill: string }[] = [];
      for (let x = 0; x < row.length;) {
        const key = row[x] ?? '.';
        let end = x + 1;
        while (row[end] === key) {
          end++;
        }
        const fill = FILL[key];
        if (fill) {
          runs.push({ x, y, w: end - x, fill });
        }
        x = end;
      }
      return runs;
    }),
  );
}
