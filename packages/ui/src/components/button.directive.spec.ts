import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';

import { ButtonDirective } from './button.directive';

@Component({
  imports: [ButtonDirective],
  template: `
    <button ncButton variant="primary">Publish</button>
    <button ncButton variant="danger" size="sm" iconOnly aria-label="Delete">x</button>
    <button ncButton size="hero">Play</button>
    <button ncButton size="tool">Crop</button>
    <button ncButton size="strip">Loop</button>
    <button ncButton pressed>Versions</button>
    <button ncButton variant="primary" pressed>Dark</button>
    <button ncButton variant="primary" copied>Copied</button>
    <button ncButton variant="ghost" disabled>Undo</button>
  `,
})
class Host {}

function classesOf(name: string): string[] {
  return screen.getByRole('button', { name }).className.split(' ');
}

describe('ButtonDirective', () => {
  it('applies variant classes and data attribute', async () => {
    await render(Host);
    const primary = screen.getByRole('button', { name: 'Publish' });
    expect(primary).toHaveAttribute('data-variant', 'primary');
    expect(classesOf('Publish')).toEqual(expect.arrayContaining(['bevel-primary', 'raised-sm']));
    expect(classesOf('Delete')).toEqual(expect.arrayContaining(['aspect-square', 'h-(--nc-h-sm)']));
    expect(classesOf('Delete')).not.toContain('px-1.5');
  });

  it('draws the two tallest sizes on the large bevel', async () => {
    await render(Host);
    expect(classesOf('Play')).toEqual(expect.arrayContaining(['raised-lg', 'h-(--nc-h-hero)']));
    expect(classesOf('Play')).not.toContain('raised-sm');
  });

  it('resolves a retired size to the step nearest it', async () => {
    await render(Host);
    expect(classesOf('Crop')).toContain('h-(--nc-h-sm)');
    expect(classesOf('Loop')).toContain('h-(--nc-h-md)');
  });

  it('sweeps only on the coloured variants', async () => {
    await render(Host);
    expect(classesOf('Publish')).toContain('glare');
    expect(classesOf('Crop')).not.toContain('glare');
  });

  it('holds a pressed button down, lit when neutral and in its own colour otherwise', async () => {
    await render(Host);
    expect(screen.getByRole('button', { name: 'Versions' })).toHaveAttribute('data-pressed', '');
    expect(classesOf('Versions')).toEqual(expect.arrayContaining(['bevel-down', 'bevel-lit']));
    expect(classesOf('Dark')).toEqual(expect.arrayContaining(['bevel-down', 'bevel-primary']));
    expect(classesOf('Dark')).not.toContain('glare');
  });

  it('lets copied replace the variant', async () => {
    await render(Host);
    expect(classesOf('Copied')).toEqual(
      expect.arrayContaining(['bevel-level', 'bevel-fill-jade-wash']),
    );
    expect(classesOf('Copied')).not.toContain('bevel-primary');
  });

  it('gives an unavailable button a frame only where it had one', async () => {
    await render(Host);
    expect(classesOf('Undo')).toContain('disabled:bevel-edge-transparent');
    expect(classesOf('Publish')).toContain('disabled:bevel-edge-line');
  });
});
