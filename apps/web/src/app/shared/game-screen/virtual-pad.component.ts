import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { TouchControl } from '@naucto/engine';
import { MarkComponent } from '@naucto/ui';

import { PadSettingsStore } from './pad-settings.store';

/** The cross and the diamond, each control at its cell of a three-by-three grid. */
const CROSS = [
  { control: 'dpad-up', at: 'col-start-2 row-start-1', mark: 'arrow-up', label: 'up' },
  { control: 'dpad-left', at: 'col-start-1 row-start-2', mark: 'arrow-left', label: 'left' },
  { control: 'dpad-right', at: 'col-start-3 row-start-2', mark: 'arrow-right', label: 'right' },
  { control: 'dpad-down', at: 'col-start-2 row-start-3', mark: 'arrow-down', label: 'down' },
] as const;

const FACES = [
  { control: 'y', at: 'col-start-2 row-start-1', legend: 'Y' },
  { control: 'x', at: 'col-start-1 row-start-2', legend: 'X' },
  { control: 'b', at: 'col-start-3 row-start-2', legend: 'B' },
  { control: 'a', at: 'col-start-2 row-start-3', legend: 'A' },
] as const;

/**
 * The on-screen pad for a touch device, drawn as a gamepad: a cross on the left, the four face
 * buttons in their diamond on the right, Start between them. Only the controls the running game
 * plugs an action into are drawn, each at the place it has on a pad.
 *
 * It draws only the controls; `TouchSource` reads them by hit-testing `data-nc-control`, so the
 * pad has no idea a game exists and the engine has no idea what the pad looks like. Two layouts,
 * chosen by orientation: a zone under the screen in portrait, an overlay on the screen's edges in
 * landscape, where there is no room for a zone.
 */
@Component({
  selector: 'nc-virtual-pad',
  imports: [MarkComponent, TranslocoPipe],
  templateUrl: './virtual-pad.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VirtualPadComponent {
  /** The controls to draw: those the running game uses. */
  readonly controls = input.required<readonly TouchControl[]>();
  /** Overlay the screen (landscape) instead of taking a zone under it (portrait). */
  readonly overlay = input(false);
  /** How much smaller than life the pad is drawn, where it is shown rather than played. */
  readonly zoom = input(1);
  /** The element `TouchSource` binds to. */
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly settings = inject(PadSettingsStore);
  protected readonly cross = computed(() =>
    CROSS.filter((arm) => this.controls().includes(arm.control)),
  );
  protected readonly faces = computed(() =>
    FACES.filter((button) => this.controls().includes(button.control)),
  );

  /**
   * Targets scale off one custom property on the wrapper, so a single number moves them together
   * and `TouchSource` goes on hit-testing exactly the same elements. Not `em`: the buttons set
   * their own font size for the legend, which would break the inheritance the scale rides on.
   * 56px at 100 % — below that a thumb misses more often than it hits.
   */
  protected readonly key =
    'flex h-[calc(56px*var(--nc-pad-scale,1))] w-[calc(56px*var(--nc-pad-scale,1))] items-center justify-center raised-sm text-ui text-ink-body active:bevel-down active:bevel-primary active:text-on-primary';
  protected readonly face = `${this.key} font-mono`;
  protected readonly start =
    'flex h-[calc(36px*var(--nc-pad-scale,1))] items-center justify-center raised-sm px-1.5 font-mono text-label text-ink-body uppercase active:bevel-down active:bevel-primary active:text-on-primary';
}
