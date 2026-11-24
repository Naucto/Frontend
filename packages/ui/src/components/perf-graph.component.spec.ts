import { render, screen } from '@testing-library/angular';

import { type PerfBand, PerfGraphComponent } from './perf-graph.component';

const BANDS: PerfBand[] = [
  { from: 0, to: 70, tone: 'ok' },
  { from: 70, to: 90, tone: 'warn' },
  { from: 90, to: Number.POSITIVE_INFINITY, tone: 'over' },
];

/** A well 60 wide and 33 tall, reported the moment it is watched. */
function stubResizeObserver(): void {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 60 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 33 });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    constructor(private readonly callback: () => void) {}
    observe(): void {
      this.callback();
    }
    disconnect(): void {}
  };
}

async function draw(samples: number[]): Promise<HTMLElement> {
  const { fixture } = await render(PerfGraphComponent, {
    inputs: {
      label: 'CPU',
      value: `${String(samples.at(-1) ?? 0)}%`,
      samples,
      max: 100,
      bands: BANDS,
    },
  });
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PerfGraphComponent', () => {
  beforeEach(stubResizeObserver);
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  });

  it('names the graph by its label and value', async () => {
    await draw([10, 20]);
    expect(screen.getByRole('img', { name: 'CPU 20%' })).toBeInTheDocument();
  });

  it.each([
    [10, 'text-lcd-ink'],
    [75, 'text-orange-ink'],
    [95, 'text-hot-ink'],
  ])('inks the value by the band the newest sample stands in (%i)', async (newest, ink) => {
    await draw([95, 10, newest]);
    expect(screen.getByText(`${String(newest)}%`).className).toContain(ink);
  });

  it('draws only the samples the well holds, the newest at its right edge', async () => {
    const host = await draw(Array.from({ length: 30 }, () => 50));
    const fill = host.querySelectorAll('path')[2]?.getAttribute('d') ?? '';
    // 60px hold ten columns of 6, the last one starting at 54.
    expect(fill.match(/M/g)).toHaveLength(10);
    expect(fill).toMatch(/^M0 /);
    expect(fill).toContain('M54 ');
  });

  it('paints each column in the colour of its own sample', async () => {
    const host = await draw([50, 80, 95]);
    const fills = [...host.querySelectorAll('path')]
      .slice(2)
      .map((path) => path.getAttribute('fill'));
    expect(fills).toEqual([
      'var(--color-lcd-ink)',
      'var(--color-lcd-ink)',
      'var(--color-orange)',
      'var(--color-orange)',
      'var(--color-hot)',
      'var(--color-hot)',
    ]);
  });

  it('marks each boundary between two bands with a dashed line', async () => {
    const host = await draw([50]);
    // Two limit lines, then the fill and the edge.
    expect(host.querySelectorAll('path')).toHaveLength(4);
  });

  it('keeps every height on a whole kit pixel', async () => {
    const host = await draw([0, 33, 66, 100, 250]);
    const svg = host.querySelector('svg');
    expect(svg?.getAttribute('height')).toBe('33');
    const ys = [
      ...(host.querySelectorAll('path')[2]?.getAttribute('d') ?? '').matchAll(/M\d+ (\d+)/g),
    ];
    for (const [, y] of ys) {
      expect(Number(y) % 3).toBe(0);
    }
  });
});
