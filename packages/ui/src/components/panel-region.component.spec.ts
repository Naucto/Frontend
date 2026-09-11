import { Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import { PanelRegionComponent } from './panel-region.component';

@Component({
  imports: [PanelRegionComponent],
  template: `
    <nc-panel-region
      [secondaryOpen]="open()"
      [viewportWidth]="viewport()"
      [splitAt]="1602"
      [primaryWidth]="421"
      [secondaryWidth]="401"
    >
      <p primary>the game</p>
      <p secondary>the reference</p>
    </nc-panel-region>
  `,
})
class Host {
  readonly open = signal(false);
  readonly viewport = signal(1280);
}

/** Track widths, in the order the region lays them out: the secondary's, then the primary's. */
function tracks(): number[] {
  return [...document.querySelectorAll('nc-panel-region > div')].map((d) =>
    Number.parseInt((d as HTMLElement).style.width, 10),
  );
}

describe('nc-panel-region', () => {
  it('gives the primary its track and keeps the secondary out of the layout', async () => {
    await render(Host);

    expect(tracks()).toEqual([0, 421]);
    expect(document.querySelector('nc-panel-region > div')).toHaveClass('hidden');
  });

  it('unfolds the secondary beside the primary where there is room for two', async () => {
    const { fixture } = await render(Host);
    fixture.componentInstance.open.set(true);
    fixture.componentInstance.viewport.set(1602);
    fixture.detectChanges();

    expect(tracks()).toEqual([401, 421]);
  });

  it('lends the primary track to the secondary where there is not', async () => {
    const { fixture } = await render(Host);
    fixture.componentInstance.open.set(true);
    fixture.componentInstance.viewport.set(1601);
    fixture.detectChanges();

    // The borrowed track is the primary's width, not the width the secondary would have had.
    expect(tracks()).toEqual([421, 0]);
  });

  /**
   * The primary may hold a running game, a live connection, or a window floating outside the flow,
   * and none of the three survives being rebuilt or having an ancestor set to `display: none`. This
   * is the one thing here whose regression would be silent: a game that restarts raises nothing.
   */
  it('never takes the primary out of the document, whatever the mode', async () => {
    const { fixture } = await render(Host);

    for (const [open, viewport] of [
      [false, 1280],
      [true, 1602],
      [true, 1601],
    ] as const) {
      fixture.componentInstance.open.set(open);
      fixture.componentInstance.viewport.set(viewport);
      fixture.detectChanges();

      expect(screen.getByText('the game')).toBeInTheDocument();
      expect(document.querySelectorAll('nc-panel-region > div')[1]).not.toHaveClass('hidden');
    }
  });
});
