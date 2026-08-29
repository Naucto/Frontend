import { Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { PopoverDirective } from './popover.directive';

@Component({
  selector: 'nc-popover-host',
  imports: [PopoverDirective],
  template: `
    <button type="button" [ncPopover]="menu" [(popoverOpen)]="open">Account</button>
    <ng-template #menu>
      <div>
        <a href="#settings" (click)="open.set(false)">Settings</a>
      </div>
    </ng-template>
  `,
})
class HostComponent {
  readonly open = signal(false);
}

/** The overlay lives outside the fixture, so ask the document rather than the container. */
const panelCount = (): number => document.querySelectorAll('.cdk-overlay-pane').length;

describe('PopoverDirective', () => {
  it('opens and closes from the trigger', async () => {
    await render(HostComponent);
    const trigger = screen.getByRole('button', { name: 'Account' });

    await userEvent.click(trigger);
    expect(panelCount()).toBe(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(trigger);
    expect(panelCount()).toBe(0);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  /**
   * The defect this pins: writing the model from the parent moved the signal but left the
   * OverlayRef attached, so the panel — and its click-eating backdrop — stayed over the page.
   */
  it('detaches the overlay when the parent closes it', async () => {
    const { fixture } = await render(HostComponent);
    await userEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(panelCount()).toBe(1);

    fixture.componentInstance.open.set(false);
    await fixture.whenStable();

    expect(panelCount()).toBe(0);
    expect(screen.getByRole('button', { name: 'Account' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('attaches the overlay when the parent opens it', async () => {
    const { fixture } = await render(HostComponent);
    expect(panelCount()).toBe(0);

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();

    expect(panelCount()).toBe(1);
  });

  /** Picking an item is the real path: it navigates *and* asks the panel to go away. */
  it('closes when an item inside the panel writes the model', async () => {
    await render(HostComponent);
    await userEvent.click(screen.getByRole('button', { name: 'Account' }));

    await userEvent.click(screen.getByRole('link', { name: 'Settings' }));

    expect(panelCount()).toBe(0);
  });
});
