import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { EdgeHandleComponent } from './edge-handle.component';

/**
 * How a region is showing its two panels.
 *
 * - `primary` — the secondary is closed.
 * - `beside`  — both, the secondary in a track of its own.
 * - `instead` — the secondary in the primary's track, because there is not room for two.
 */
export type PanelRegionMode = 'primary' | 'beside' | 'instead';

/**
 * Where the primary is not showing, its track is narrowed to nothing rather than hidden: taking it
 * out of the layout would take anything floating out of the flow beneath it with it. So the region
 * only sets the track, and a panel that finds itself in a track of no width has to fold its own
 * contents away.
 */
@Component({
  selector: 'nc-panel-region',
  imports: [EdgeHandleComponent],
  template: `
    @if (switchLabel()) {
      <nc-edge-handle [icon]="switchIcon()" [label]="switchLabel()" (pressed)="switched.emit()" />
    }
    <!-- An explicit minmax track rather than the implicit auto one: a grid item whose min track
       sizing function is auto takes an automatic minimum size of its min-content width, and so
       refuses the track this region just set for it — the panel keeps its content's width and
       hangs off the side of the viewport, where the window clips it. -->
    <div
      class="grid min-h-0 grid-cols-[minmax(0,1fr)]"
      [class.hidden]="mode() === 'primary'"
      [style.width.px]="secondaryTrack()"
    >
      <ng-content select="[secondary]" />
    </div>
    <div class="grid min-h-0 grid-cols-[minmax(0,1fr)]" [style.width.px]="primaryTrack()">
      <ng-content select="[primary]" />
    </div>
  `,
  host: { class: 'relative flex h-full min-h-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PanelRegionComponent {
  readonly secondaryOpen = input(false);
  readonly viewportWidth = input.required<number>();
  /** Viewport width at which the secondary stops borrowing the primary's track and gets its own. */
  readonly splitAt = input.required<number>();
  readonly primaryWidth = input(0);
  readonly secondaryWidth = input(0);
  /**
   * What the control on the region's edge does next, in the caller's own words. Empty for a region
   * with nothing to switch to, which is what leaves the control out.
   */
  readonly switchLabel = input('');
  readonly switched = output();

  readonly mode = computed<PanelRegionMode>(() => {
    if (!this.secondaryOpen()) return 'primary';
    return this.viewportWidth() >= this.splitAt() ? 'beside' : 'instead';
  });

  /** A chevron where the secondary can arrive beside the primary, a swap where it cannot. */
  protected readonly switchIcon = computed(() => {
    if (this.mode() === 'instead') return 'sync';
    if (this.mode() === 'beside') return 'chevron-right';
    return this.viewportWidth() >= this.splitAt() ? 'chevron-left' : 'sync';
  });

  protected readonly primaryTrack = computed(() =>
    this.mode() === 'instead' ? 0 : this.primaryWidth(),
  );

  /** Borrowing the primary's track means taking its width too, not the width it would have had. */
  protected readonly secondaryTrack = computed(() => {
    const mode = this.mode();
    if (mode === 'primary') return 0;
    return mode === 'beside' ? this.secondaryWidth() : this.primaryWidth();
  });
}
