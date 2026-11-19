import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { IconComponent, type IconName } from '@naucto/ui';

/** What the disk offers once it is reached; `none` raises nothing. */
export type FloppyAction = 'play' | 'edit' | 'new' | 'none';
/** `title` is the card: disk, name and whatever is projected. `thumb` is the disk alone, still. */
export type FloppyMode = 'title' | 'thumb';

const ACTION_ICON: Record<FloppyAction, IconName> = {
  play: 'play',
  edit: 'edit',
  new: 'plus',
  none: 'plus',
};

/** A name is narrowed this far to stay whole; past it, it is cut. */
const TIGHTEST = 0.7;

/**
 * A game as a 3.5" disk: its cover is the label. Reached by the pointer, the disk leans toward it
 * under a light that follows, the shutter slides off the window, the preview plays over the cover
 * and the action stands off the label. `open` is that same state for the keyboard, without the
 * lean.
 *
 * It is a picture, not a control: the link around it is the caller's, and an `a` that holds one
 * opens it on `:focus-visible` with nothing to bind. Project `[info]` into the band along the
 * bottom of the label and `[meta]` under the name.
 */
@Component({
  selector: 'nc-floppy',
  imports: [IconComponent],
  templateUrl: './floppy.component.html',
  styleUrl: './floppy.component.css',
  host: {
    class: 'block',
    '[class.open]': 'open()',
    '[class.thumb]': 'mode() === "thumb"',
    '[style.--floppy-body]': 'body() ?? null',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloppyComponent {
  readonly name = input.required<string>();
  /** The plastic, as any CSS colour; every shade of the shell is mixed from it. */
  readonly body = input<string>();
  readonly cover = input<string | null>(null);
  /** A clip that plays over the cover while the disk is reached. */
  readonly preview = input<string | null>(null);
  readonly action = input<FloppyAction>('none');
  readonly actionLabel = input('');
  readonly open = input(false, { transform: booleanAttribute });
  readonly mode = input<FloppyMode>('title');
  readonly titleAlign = input<'start' | 'center'>('center');
  /** The disk that does not exist yet: an outline until it is reached. */
  readonly ghost = input(false, { transform: booleanAttribute });

  protected readonly ACTION_ICON = ACTION_ICON;

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly disk = viewChild<ElementRef<HTMLElement>>('disk');
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private hovered = false;

  /** Narrow the name until it fits its line, rather than cut a word the disk has room to print. */
  private squeeze(): void {
    const title = this.title()?.nativeElement;
    const text = title?.firstElementChild;
    if (!title || !text || !title.clientWidth) {
      return;
    }
    const fit = Math.min(1, Math.max(TIGHTEST, title.clientWidth / text.scrollWidth));
    title.style.setProperty('--f-squeeze', fit.toFixed(3));
  }

  /** The preview runs while the disk is reached and rewinds when it is left. */
  private roll(): void {
    const video = this.video()?.nativeElement;
    if (!video) {
      return;
    }
    const still =
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      this.element.closest('[data-reduce-motion]') !== null;
    if ((this.hovered || this.open()) && !still) {
      // A refused autoplay leaves the cover in place, which is the right fallback.
      video.play().catch(() => undefined);
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }

  constructor() {
    const host = this.element;
    // Bound by hand: a template listener would schedule a change detection on every pointer move,
    // and nothing here is the template's to redraw.
    const lean = (event: PointerEvent): void => {
      const box = this.disk()?.nativeElement.getBoundingClientRect();
      if (event.pointerType !== 'mouse' || !box || this.mode() === 'thumb') {
        return;
      }
      const x = ((event.clientX - box.left) / box.width) * 2 - 1;
      const y = ((event.clientY - box.top) / box.height) * 2 - 1;
      host.style.setProperty('--f-x', Math.max(-1, Math.min(1, x)).toFixed(3));
      host.style.setProperty('--f-y', Math.max(-1, Math.min(1, y)).toFixed(3));
    };
    const enter = (): void => {
      this.hovered = true;
      host.classList.add('tilting');
      this.roll();
    };
    const leave = (): void => {
      this.hovered = false;
      host.classList.remove('tilting');
      host.style.removeProperty('--f-x');
      host.style.removeProperty('--f-y');
      this.roll();
    };
    host.addEventListener('pointermove', lean, { passive: true });
    host.addEventListener('pointerenter', enter);
    host.addEventListener('pointerleave', leave);

    const observer = new ResizeObserver(() => {
      this.squeeze();
    });
    inject(DestroyRef).onDestroy(() => {
      host.removeEventListener('pointermove', lean);
      host.removeEventListener('pointerenter', enter);
      host.removeEventListener('pointerleave', leave);
      observer.disconnect();
    });

    afterRenderEffect(() => {
      this.name();
      const title = this.title()?.nativeElement;
      observer.disconnect();
      if (title) {
        observer.observe(title);
        this.squeeze();
        // The name is measured in a face that may still be on its way.
        void document.fonts.ready.then(() => {
          this.squeeze();
        });
      }
    });

    effect(() => {
      this.open();
      this.video();
      this.roll();
    });
  }
}
