import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';

import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon.component';

/** The current dot's fill starts as the square an idle dot is: 8 of its 34 pixels. */
const SQUARE = 8 / 34;

/**
 * Where you are among a few pages: a row of dots, the current one drawn wide, between two arrows
 * that wrap around. With `autoplay` the current dot fills over that many milliseconds and the
 * pager moves on when it is full; the pointer being on the pager holds the fill where it is.
 *
 * The fill is one animation whose end is the advance, so what is drawn and what is timed cannot
 * drift apart, and holding it is pausing that one thing.
 */
@Component({
  selector: 'nc-pager',
  imports: [ButtonDirective, IconComponent],
  templateUrl: './pager.component.html',
  host: {
    class: 'inline-flex items-center gap-[14px]',
    '(mouseenter)': 'held.set(true)',
    '(mouseleave)': 'held.set(false)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PagerComponent {
  readonly count = input.required<number>();
  /** The current page, from 0. */
  readonly value = model(0);
  /** Milliseconds a page stays before the next one takes its place. 0 leaves it to the reader. */
  readonly autoplay = input(0);
  readonly label = input('Pages');
  /** What a dot is called, before its number. */
  readonly pageLabel = input('Page');
  readonly previousLabel = input('Previous page');
  readonly nextLabel = input('Next page');

  protected readonly pages = computed(() => Array.from({ length: this.count() }, (_, i) => i));
  protected readonly held = signal(false);
  private readonly fill = viewChild<ElementRef<HTMLElement>>('fill');
  private readonly run = signal<Animation | null>(null);

  protected step(by: number): void {
    const count = this.count();
    this.value.update((page) => (page + by + count) % count);
  }

  constructor() {
    effect((onCleanup) => {
      const el = this.fill()?.nativeElement;
      const duration = this.autoplay();
      // The fill belongs to the current dot, so a new page is a new element and a fresh run.
      if (!el || duration <= 0 || this.count() < 2 || typeof el.animate !== 'function') {
        return;
      }
      const run = el.animate([{ transform: `scaleX(${String(SQUARE)})` }, { transform: 'none' }], {
        duration,
        fill: 'forwards',
      });
      run.onfinish = (): void => {
        this.step(1);
      };
      this.run.set(run);
      onCleanup(() => {
        this.run.set(null);
        run.onfinish = null;
        run.cancel();
      });
    });
    effect(() => {
      const run = this.run();
      if (this.held()) {
        run?.pause();
      } else {
        run?.play();
      }
    });
  }
}
