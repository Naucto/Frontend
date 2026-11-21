import { render } from '@testing-library/angular';
import { expect, it } from 'vitest';

import { PadArtComponent } from './pad-art.component';

const part = (container: Element, id: string): Element => {
  const found = container.querySelector(`[data-part="${id}"]`);
  if (!found) {
    throw new Error(`no ${id} on the pad`);
  }

  return found;
};

/** Where a part stands on the drawing, in cells. */
const cell = (element: Element): number[] =>
  (element.getAttribute('transform') ?? '').match(/-?\d+/g)?.map(Number) ?? [];

it('sets the four face buttons in a diamond: A at the bottom, B right, X left, Y at the top', async () => {
  const { container } = await render(PadArtComponent);
  const [a, b, x, y] = ['a', 'b', 'x', 'y'].map((id) => cell(part(container, id)));

  expect(a?.[1]).toBeGreaterThan(b?.[1] ?? 0);
  expect(y?.[1]).toBeLessThan(x?.[1] ?? 0);
  expect(x?.[0]).toBeLessThan(a?.[0] ?? 0);
  expect(b?.[0]).toBeGreaterThan(a?.[0] ?? 0);
  expect(a?.[0]).toBe(y?.[0]);
  expect(x?.[1]).toBe(b?.[1]);
});

it('is drawn on whole cells of 3px, and never scaled', async () => {
  const { container } = await render(PadArtComponent);
  const svg = container.querySelector('svg');
  const [, , width, height] = (svg?.getAttribute('viewBox') ?? '').split(' ').map(Number);

  expect(Number(svg?.getAttribute('width'))).toBe((width ?? 0) * 3);
  expect(Number(svg?.getAttribute('height'))).toBe((height ?? 0) * 3);
  for (const path of container.querySelectorAll('path')) {
    expect(path.getAttribute('d')).not.toMatch(/\d\.\d/);
  }
});

it('lights what is held, in the colour of the player', async () => {
  const { container, fixture } = await render(PadArtComponent, {
    inputs: { held: ['a', 'lt'], tone: 'sky' },
  });

  expect(
    [...container.querySelectorAll('[data-lit]')].map((lit) => lit.getAttribute('data-part')),
  ).toEqual(['lt', 'a']);
  expect(fixture.nativeElement).toHaveClass('[--pad-lit:var(--color-sky)]');
});

it('moves a stick the way it leans, and lights it', async () => {
  const { container } = await render(PadArtComponent, { inputs: { left: [-1, 1] } });

  expect(cell(part(container, 'ls'))).toEqual([1, 5]);
  expect(part(container, 'ls')).toHaveAttribute('data-lit');
  expect(cell(part(container, 'rs'))).toEqual([3, 3]);
  expect(part(container, 'rs')).not.toHaveAttribute('data-lit');
});

it('draws a seat nobody holds as outlines', async () => {
  const { container } = await render(PadArtComponent, { inputs: { ghost: true } });

  expect(container.querySelector('svg')).toHaveAttribute('data-ghost');
});
