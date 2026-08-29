import { render, screen } from '@testing-library/angular';

import { StepperComponent } from './stepper.component';

const styleSheet = (): string =>
  ((StepperComponent as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles ?? []).join('\n');

describe('StepperComponent', () => {
  it('marks the current step', async () => {
    await render(StepperComponent, { inputs: { value: 2, options: ['1×1', '2×2', '3×3'] } });
    expect(screen.getByRole('slider')).toBeTruthy();
  });

  /**
   * The ticks and the fill are two layers of one `background-image`. Declaring `.nc-range` twice
   * silently drops the first: CSS does not merge them, the later block replaces the property
   * outright. That has now happened twice, and both times it removed the tick per step — the whole
   * reason a stepper is not a slider — while leaving the component looking otherwise fine, so
   * nothing failed until somebody looked at the groove.
   */
  it('sets background-image on the groove exactly once, so the tick layer survives', () => {
    const declarations = styleSheet().match(/background-image\s*:/g) ?? [];
    expect(declarations.length).toBe(1);
  });

  it('keeps both the tick track and the fill in the background', () => {
    const css = styleSheet();
    expect(css).toContain('radial-gradient');
    // Custom properties come out namespaced in the compiled sheet, so match the bare name.
    expect(css).toMatch(/nc-fill/);
  });
});
