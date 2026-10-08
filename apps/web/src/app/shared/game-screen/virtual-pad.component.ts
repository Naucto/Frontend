import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
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
  imports: [IconComponent, TranslocoPipe],
  templateUrl: './virtual-pad.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VirtualPadComponent {
  /** Overlay the screen (landscape) instead of taking a zone under it (portrait). */
  readonly overlay = input(false);
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
  /** Icons rather than arrow characters, which the pixel typeface does not hold. Sized in CSS because `nc-icon` writes width and height as attributes, which a class beats. */
  protected readonly arrow =
    'h-[calc(24px*var(--nc-pad-scale,1))] w-[calc(24px*var(--nc-pad-scale,1))] [&>svg]:h-full [&>svg]:w-full';
  protected readonly face =
    'flex h-[calc(64px*var(--nc-pad-scale,1))] w-[calc(64px*var(--nc-pad-scale,1))] items-center justify-center rounded-full border border-line-strong bg-raised font-mono text-ui text-ink-body active:bg-gold active:text-on-accent';
}
