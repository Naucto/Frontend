import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { TOUCH_CONTROLS } from '@naucto/engine';

import { VirtualPadComponent } from '../game-screen/virtual-pad.component';

/** How wide the screen the preview stands for is: a phone held sideways. */
const PHONE_WIDTH = 844;

/**
 * The on-screen pad as it lies over a game, every control it can draw, at the size and the
 * opacity the device is set to. Its keys keep the share of the screen they take on a phone,
 * whatever the width the preview is given. Nothing in it can be pressed.
 */
@Component({
  selector: 'nc-pad-preview',
  imports: [VirtualPadComponent],
  template: `
    <div class="no-cover size-full"></div>
    <nc-virtual-pad [controls]="controls" [overlay]="true" [zoom]="zoom()" />
  `,
  host: {
    class: 'flat-sm bevel-edge-line-strong relative block aspect-video overflow-hidden',
    inert: '',
    'aria-hidden': 'true',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PadPreviewComponent {
  protected readonly controls = TOUCH_CONTROLS;
  protected readonly zoom = signal(0.5);

  constructor() {
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        this.zoom.set(entry.contentRect.width / PHONE_WIDTH);
      }
    });
    observer.observe(inject<ElementRef<HTMLElement>>(ElementRef).nativeElement);
    inject(DestroyRef).onDestroy(() => {
      observer.disconnect();
    });
  }
}
