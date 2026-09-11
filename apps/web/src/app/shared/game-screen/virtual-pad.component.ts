import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { IconComponent } from '@naucto/ui';

import { PadSettingsStore } from './pad-settings.store';

/**
 * The on-screen pad for a touch device: a d-pad on the left, A and B on the right.
 *
 * It draws only the controls; `TouchSource` reads them by hit-testing `data-nc-action`, so the
 * pad has no idea a game exists and the engine has no idea what the pad looks like. Two layouts,
 * chosen by orientation: a zone under the screen in portrait, an overlay on the screen's edges in
 * landscape, where there is no room for a zone.
 */
@Component({
  selector: 'nc-virtual-pad',
  imports: [IconComponent],
  template: `
    <div
      class="flex touch-none items-center justify-between gap-2 select-none"
      [class]="
        overlay()
          ? 'pointer-events-none absolute inset-0 p-2'
          : 'w-full bg-panel px-2 py-2 pb-[max(16px,env(safe-area-inset-bottom))]'
      "
      role="group"
      [attr.aria-label]="label()"
      [style.--nc-pad-scale]="settings.scale()"
      [style.opacity]="overlay() ? settings.opacity() / 100 : 1"
    >
      <!-- D-pad: a 3×3 grid with the corners left empty, so a thumb between two arrows slides
           between them instead of falling into a dead cell. -->
      <div class="pointer-events-auto grid grid-cols-3 grid-rows-3 gap-0.5">
        <span></span>
        <button type="button" [class]="key" data-nc-action="up" aria-label="Up">
          <nc-icon name="arrow-up" [size]="24" [class]="arrow" />
        </button>
        <span></span>
        <button type="button" [class]="key" data-nc-action="left" aria-label="Left">
          <nc-icon name="arrow-left" [size]="24" [class]="arrow" />
        </button>
        <span class="rounded-xs bg-line/40"></span>
        <button type="button" [class]="key" data-nc-action="right" aria-label="Right">
          <nc-icon name="arrow-right" [size]="24" [class]="arrow" />
        </button>
        <span></span>
        <button type="button" [class]="key" data-nc-action="down" aria-label="Down">
          <nc-icon name="arrow-down" [size]="24" [class]="arrow" />
        </button>
        <span></span>
      </div>

      <div class="pointer-events-auto flex items-center gap-1.5">
        <button type="button" [class]="face" data-nc-action="pause" aria-label="Pause">II</button>
        <button type="button" [class]="face" data-nc-action="b" aria-label="B">B</button>
        <button type="button" [class]="face" data-nc-action="a" aria-label="A">A</button>
      </div>
    </div>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VirtualPadComponent {
  /** Overlay the screen (landscape) instead of taking a zone under it (portrait). */
  readonly overlay = input(false);
  readonly label = input('On-screen controls');
  /** The element `TouchSource` binds to. */
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly settings = inject(PadSettingsStore);

  /**
   * Targets scale off one custom property on the wrapper, so a single number moves them together
   * and `TouchSource` goes on hit-testing exactly the same elements. Not `em`: the buttons set
   * their own font size for the glyph, which would break the inheritance the scale rides on.
   * 56px at 100 % — below that a thumb misses more often than it hits.
   */
  protected readonly key =
    'flex h-[calc(56px*var(--nc-pad-scale,1))] w-[calc(56px*var(--nc-pad-scale,1))] items-center justify-center rounded-sm border border-line-strong bg-raised text-ui text-ink-body active:bg-gold active:text-on-accent';
  /**
   * The arrows are icons, not ▲◀▶▼. Those characters are not in HD44780, so the browser drew them
   * from whatever face it reached for next — smooth triangles on a pixel keypad. Sized in CSS
   * because `nc-icon` writes width and height as attributes, which a class beats.
   */
  protected readonly arrow =
    'h-[calc(24px*var(--nc-pad-scale,1))] w-[calc(24px*var(--nc-pad-scale,1))] [&>svg]:h-full [&>svg]:w-full';
  protected readonly face =
    'flex h-[calc(64px*var(--nc-pad-scale,1))] w-[calc(64px*var(--nc-pad-scale,1))] items-center justify-center rounded-full border border-line-strong bg-raised font-mono text-ui text-ink-body active:bg-gold active:text-on-accent';
}
