import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';

import { ButtonDirective } from './button.directive';
import { JoinedDirective } from './joined.directive';

@Component({
  imports: [ButtonDirective, JoinedDirective],
  template: `
    <span ncJoined data-testid="strip">
      <button ncButton variant="run" iconOnly pressed aria-label="Pause">p</button>
      <button ncButton variant="ghost" iconOnly aria-label="Restart">r</button>
      <button ncButton variant="ghost" iconOnly disabled aria-label="Step">s</button>
    </span>
    <button ncButton variant="ghost" iconOnly aria-label="Alone">a</button>
  `,
})
class Host {}

function classesOf(name: string): string[] {
  return screen.getByRole('button', { name }).className.split(' ');
}

describe('JoinedDirective', () => {
  it('lays the strip out with no ground of its own', async () => {
    await render(Host);
    const strip = screen.getByTestId('strip').className.split(' ');
    expect(strip).toEqual(expect.arrayContaining(['inline-flex']));
    expect(strip.filter((name) => name.startsWith('bg-'))).toEqual([]);
  });

  it('frames a ghost cell in the line at rest, unfilled, and lights it on hover', async () => {
    await render(Host);
    expect(classesOf('Restart')).toEqual(
      expect.arrayContaining([
        'bevel-edge-line',
        'bevel-fill-transparent',
        'hover:bevel-lit',
        'hover:bevel-fill-raised',
      ]),
    );
    expect(classesOf('Restart')).not.toContain('bevel-bare');
    expect(classesOf('Step')).toEqual(expect.arrayContaining(['disabled:bevel-edge-line']));
  });

  it('opens the sides cells share and draws the line between them', async () => {
    await render(Host);
    expect(classesOf('Restart')).toEqual(
      expect.arrayContaining([
        'not-first:bevel-open-l',
        'not-last:bevel-open-r',
        'not-first:before:bg-line',
      ]),
    );
  });

  it('leaves a latched cell its own colour, and a button outside a strip as it was', async () => {
    await render(Host);
    expect(classesOf('Pause')).toEqual(expect.arrayContaining(['bevel-hot', 'bevel-down']));
    expect(classesOf('Alone')).toEqual(expect.arrayContaining(['bevel-bare']));
    expect(classesOf('Alone')).not.toContain('not-first:bevel-open-l');
  });
});
