import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * How a region is showing its two panels.
 *
 * - `primary` — the secondary is closed.
 * - `beside`  — both, the secondary in a track of its own.
 * - `instead` — the secondary in the primary's track, because there is not room for two.
 */
export type PanelRegionMode = 'primary' | 'beside' | 'instead';

/**
 * A panel and the optional second one that either unfolds beside it or takes its place.
 *
 * Which of the two happens is a question of room, so the region is told the viewport's width and
 * the width below which two tracks stop fitting. Everything else — what the panels hold, when the
 * secondary opens — belongs to the caller.
 *
 * **The primary is never torn down and never taken out of the layout.** Where it is not showing it
 * is a track of zero width, because it may hold something that cannot survive being rebuilt — a
 * running game, a live connection — and because `display: none` on an ancestor takes any window
 * floating out of the flow with it. A panel in a zero-width track must therefore fold its own
 * contents away; the region only sets the track.
 *
 * The secondary only leaves the layout; whether it also leaves the document is the caller's to
 * decide, and worth deciding — a panel built at every boot for a track nobody has opened is a cost
 * paid by everyone who never opens it.
 */
@Component({
  selector: 'nc-panel-region',
  template: `
    <div
      class="grid min-h-0"
      [class.hidden]="mode() === 'primary'"
      [style.width.px]="secondaryTrack()"
    >
      <ng-content select="[secondary]" />
    </div>
    <div class="grid min-h-0" [style.width.px]="primaryTrack()">
      <ng-content select="[primary]" />
    </div>
  `,
  host: { class: 'flex h-full min-h-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PanelRegionComponent {
  readonly secondaryOpen = input(false);
  readonly viewportWidth = input.required<number>();
  /** Viewport width at which the secondary stops borrowing the primary's track and gets its own. */
  readonly splitAt = input.required<number>();
  readonly primaryWidth = input(0);
  readonly secondaryWidth = input(0);

  readonly mode = computed<PanelRegionMode>(() => {
    if (!this.secondaryOpen()) return 'primary';
    return this.viewportWidth() >= this.splitAt() ? 'beside' : 'instead';
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
