import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';

import { ButtonDirective } from './button.directive';
import { MarkComponent } from './mark.component';

/** The current dot's fill starts as the square an idle dot is: 8 of its 34 pixels. */
const SQUARE = 8 / 34;

/**
 * Where you are among a few pages: a row of dots, the current one drawn wide, between two arrows
 * that wrap around. With `autoplay` the current dot fills over that many milliseconds and the
 * pager moves on when it is full; the pointer being on the pager holds the fill where it is.
 *
 * The dots are one tab stop: the current one takes the focus, and the arrow keys move it and the
 * page together, wrapping as the arrows do.
 *
 * The fill is one animation whose end is the advance, so what is drawn and what is timed cannot
 * drift apart, and holding it is pausing that one thing.
 */
@Component({
  selector: 'nc-pager',
  imports: [ButtonDirective, MarkComponent],
  templateUrl: './pager.component.html',
  host: {
    class: 'inline-flex items-center gap-[14px]',
    '(mouseenter)': 'held.set(true)',
    '(mouseleave)': 'held.set(false)',
    '(keydown)': 'onKey($event)',
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
  /** What each dot is called instead, when the pages have names of their own. */
  readonly labels = input<readonly string[]>();
  /** Off where whatever is paged already carries its own arrows. */
  readonly arrows = input(true, { transform: booleanAttribute });
  /** The id of what the dots page, for `aria-controls`. */
  readonly controls = input<string>();

  protected readonly pages = computed(() => Array.from({ length: this.count() }, (_, i) => i));
  protected readonly held = signal(false);
  private readonly fill = viewChild<ElementRef<HTMLElement>>('fill');
  private readonly run = signal<Animation | null>(null);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected step(by: number): void {
    const count = this.count();
    this.value.update((page) => (page + by + count) % count);
  }

  protected onKey(event: KeyboardEvent): void {
    const onDot = (event.target as Element).matches('[role="tab"]');
    if (!onDot || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) {
      return;
    }
    event.preventDefault();
    // Whatever holds the pager may page on the same keys.
    event.stopPropagation();
    this.step(event.key === 'ArrowRight' ? 1 : -1);
    afterNextRender(
      () => {
        this.host.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
      },
      { injector: this.injector },
    );
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
