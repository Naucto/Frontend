import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { BitFlagsComponent } from './bit-flags.component';
import { ButtonDirective } from './button.directive';
import { CheckboxComponent } from './checkbox.component';
import { DisabledScopeDirective, LooksOnlyDirective } from './disabled-scope.directive';
import { InputDirective } from './input.directive';
import { NumberFieldComponent } from './number-field.component';
import { RatingComponent } from './rating.component';
import { SearchComponent } from './search.component';
import { SegmentedComponent } from './segmented.component';
import { SliderComponent } from './slider.component';
import { SlotGridComponent } from './slot-grid.component';
import { StepperComponent } from './stepper.component';
import { SwatchPickerComponent } from './swatch-picker.component';
import { TabsComponent } from './tabs.component';
import { TagInputComponent } from './tag-input.component';
import { ToggleComponent } from './toggle.component';
import { ToggleButtonComponent } from './toggle-button.component';
import { ToolGroupComponent } from './tool-group.component';

@Component({
  imports: [
    DisabledScopeDirective,
    LooksOnlyDirective,
    BitFlagsComponent,
    ButtonDirective,
    CheckboxComponent,
    InputDirective,
    NumberFieldComponent,
    RatingComponent,
    SearchComponent,
    SegmentedComponent,
    SliderComponent,
    SlotGridComponent,
    StepperComponent,
    SwatchPickerComponent,
    TabsComponent,
    TagInputComponent,
    ToggleComponent,
    ToggleButtonComponent,
    ToolGroupComponent,
  ],
  template: `
    <div data-testid="scope" [ncDisabledScope]="closed()">
      <button ncButton>Save</button>
      <label ncButton>
        Upload
        <input type="file" aria-label="File" />
      </label>
      <a ncButton href="/play/1">Play page</a>
      <input ncInput aria-label="Name" />
      <textarea ncInput aria-label="About"></textarea>
      <nc-checkbox label="Match case" />
      <nc-toggle label="Auto-run" />
      <nc-toggle-button label="Grid" />
      <nc-segmented [options]="options" value="a" label="Visibility" />
      <nc-slider label="BPM" />
      <nc-stepper [options]="steps" label="Size" />
      <nc-rating label="Score" />
      <nc-tag-input placeholder="Tags" />
      <nc-swatch-picker [colours]="colours" [slots]="[0, 1]" />
      <nc-bit-flags label="Flags" />
      <nc-tabs [tabs]="tabs" value="one" label="Files" editable removable />
      <nc-slot-grid [cells]="cells" />
      <nc-tool-group [items]="tools" value="pen" label="Tools" />
      <nc-number-field [value]="4" ariaLabel="Steps" />
      <nc-search placeholder="Invite by name" />

      <div data-testid="looks">
        <button ncButton ncLooksOnly>Zoom in</button>
        <nc-tabs ncLooksOnly [tabs]="tabs" value="one" label="Views">
          <button actions ncButton>Add a view</button>
        </nc-tabs>
        <nc-segmented ncLooksOnly [options]="options" value="a" label="Layer" />
        <span ncLooksOnly>
          <nc-toggle-button label="Onion" />
          <span [ncDisabledScope]="false">
            <button ncButton>Fit</button>
          </span>
        </span>
        <button ncButton ncLooksOnly disabled>Undo</button>
      </div>

      <span [ncDisabledScope]="false">
        <button ncButton>Nested</button>
      </span>
    </div>
  `,
})
class Host {
  readonly closed = signal(true);
  protected readonly options = [
    { value: 'a', label: 'Draft' },
    { value: 'b', label: 'Public' },
  ];
  protected readonly steps = ['1', '2', '3'];
  protected readonly colours = ['#000000', '#ffffff'];
  protected readonly tabs = [
    { value: 'one', label: 'main' },
    { value: 'two', label: 'helpers' },
  ];
  protected readonly cells = [
    { n: 0, state: 'current' as const },
    { n: 1, state: 'empty' as const },
  ];
  protected readonly tools = [
    { value: 'pen', icon: 'edit' as const, label: 'Pen' },
    { value: 'pick', icon: 'drop' as const, label: 'Pick' },
  ];
}

/** Everything in the scope that a press or a key could reach, the looking corner left out. */
function controls(): HTMLElement[] {
  const looks = screen.getByTestId('looks');
  return [
    ...screen
      .getByTestId('scope')
      .querySelectorAll<HTMLElement>('button, input, textarea, [role="tab"]'),
  ].filter((el) => !looks.contains(el));
}

function isClosed(el: HTMLElement): boolean {
  return (
    el.matches(':disabled') ||
    el.getAttribute('aria-disabled') === 'true' ||
    el.closest('[inert]') !== null
  );
}

describe('DisabledScopeDirective', () => {
  it('closes every kit control under it', async () => {
    await render(Host);

    const open = controls()
      .filter((el) => !isClosed(el))
      .map((el) => el.getAttribute('aria-label') ?? el.textContent.trim());
    expect(open).toEqual([]);
    // One of each, so a control whose template lost its buttons does not pass by being empty.
    expect(controls().length).toBeGreaterThan(40);
  });

  it('opens them again when it is told to', async () => {
    const { fixture } = await render(Host);
    fixture.componentInstance.closed.set(false);
    fixture.detectChanges();

    expect(controls().filter(isClosed)).toEqual([]);
  });

  it('keeps a link open: following one writes nothing', async () => {
    await render(Host);

    const link = screen.getByRole('link', { name: 'Play page' });
    expect(link).not.toHaveAttribute('aria-disabled');
    expect(link).not.toHaveAttribute('inert');
  });

  it('makes a closed label inert with the input it wraps, and draws it as unavailable', async () => {
    await render(Host);

    const label = screen.getByText('Upload');
    expect(label).toHaveAttribute('inert');
    expect(label).toHaveClass('bevel-level', 'text-ink-4');
  });

  it('cannot be reopened from inside by another scope', async () => {
    await render(Host);

    expect(screen.getByRole('button', { name: 'Nested' })).toBeDisabled();
  });
});

describe('LooksOnlyDirective', () => {
  it('lets a control through a closed scope, alone or with everything under it', async () => {
    await render(Host);

    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'Onion' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Fit' })).toBeEnabled();
    const [draft, , ...layer] = screen.getAllByRole('radio', { name: /Draft|Public/ });
    expect(draft).toBeDisabled();
    expect(layer).toHaveLength(2);
    for (const radio of layer) {
      expect(radio).toBeEnabled();
    }
  });

  it('still navigates a tab strip it let through', async () => {
    await render(Host);
    const views = screen.getByRole('tablist', { name: 'Views' });
    const second = views.querySelectorAll<HTMLElement>('[role="tab"]')[1];

    await userEvent.click(second!);

    expect(second).toHaveAttribute('aria-selected', 'true');
  });

  it('lets a control through alone: what is projected into it stays closed', async () => {
    await render(Host);

    expect(screen.getByRole('button', { name: 'Add a view' })).toBeDisabled();
  });

  it('leaves a control closed by its own disabled', async () => {
    await render(Host);

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});

/**
 * A control that can be disabled and does not ask the scope stays open inside a closed one, which
 * is the hole default-deny exists to rule out.
 */
it('has every kit control with a disabled input read the scope', () => {
  const dir = import.meta.dirname;
  const disabled = readdirSync(dir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .map((file) => ({ file, source: readFileSync(resolve(dir, file), 'utf8') }))
    .filter(({ source }) => source.includes('readonly disabled = input('));

  // Seventeen today; fewer would mean the sources were not the ones read.
  expect(disabled.length).toBeGreaterThanOrEqual(17);
  expect(
    disabled.filter(({ source }) => !source.includes('closedBy(')).map(({ file }) => file),
  ).toEqual([]);
});
