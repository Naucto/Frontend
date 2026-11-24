import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { prefersStill } from '@naucto/ui';

import { HERO_BLEED, heroMask } from './hero-mask';

interface Picture {
  cover: string | null;
  clip: string | null;
}

/** What a game with neither a cover nor a clip shows: the page's own ground, through the mask. */
const NOTHING: Picture = { cover: null, clip: null };

/** A clip that has not started by then gives way to its cover. */
const CLIP_PATIENCE = 1200;

/**
 * What lies behind the hero: the cover of the game in front, or its clip playing silently, cut by
 * a dither that leaves the text clear, beside the pile or above it, and dissolves into what
 * follows.
 *
 * Two layers stay in place. The next picture loads in the one underneath, and only once it has
 * something to show does that layer come to the front, through a dither, over the one still
 * showing — so there is never an empty frame between two games. A game with nothing to show
 * brings no layer: the picture in front dithers out instead, onto the ground of the page, which
 * already takes that game's colour. Where motion is reduced the clip is left out and the cover
 * stands.
 */
@Component({
  selector: 'nc-hero-backdrop',
  templateUrl: './hero-backdrop.component.html',
  host: {
    class:
      'pointer-events-none absolute inset-x-[calc(var(--nc-page-gutter,0px)*-1)] -top-[36px] z-0 overflow-hidden mask-no-repeat',
    'aria-hidden': 'true',
    '[style.bottom.px]': '-bleed',
    '[style.mask-image]': 'mask()',
    '[style.mask-size]': 'maskSize()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroBackdropComponent {
  readonly cover = input<string | null>(null);
  readonly clip = input<string | null>(null);

  protected readonly bleed = HERO_BLEED;
  protected readonly layers = signal<readonly (Picture | null)[]>([null, null]);
  protected readonly front = signal(0);
  /** Whether a layer has come to the front since the first: only then is there a change to show. */
  protected readonly changed = signal(false);
  /** The layer dithering out because the game now in front has nothing to show. */
  protected readonly leaving = signal<number | null>(null);
  protected readonly mask = signal('var(--nc-dither-none)');
  protected readonly maskSize = signal('auto');

  /**
   * The layer loading underneath, until it comes to the front. It stays masked out meanwhile: the
   * layer over it may be bare, or dithering out.
   */
  protected readonly loading = signal<number | null>(null);
  private patience: ReturnType<typeof setTimeout> | undefined;

  protected show(layer: number): void {
    if (this.loading() !== layer) {
      return;
    }
    clearTimeout(this.patience);
    this.loading.set(null);
    this.front.set(layer);
    this.changed.set(true);
  }

  /**
   * Once a layer has fully left, it is bare; once the front layer has fully arrived, the one it
   * covers has nothing left to play.
   */
  protected settle(layer: number): void {
    if (layer === this.leaving()) {
      this.leaving.set(null);
      this.layers.update((layers) =>
        layers.map((picture, i) => (i !== layer ? picture : i === this.front() ? NOTHING : null)),
      );
    } else if (this.loading() === null) {
      this.leaving.set(null);
      this.layers.update((layers) =>
        layers.map((picture, i) => (i === this.front() ? picture : null)),
      );
    }
  }

  /** Starts a clip from its middle, where a game is more likely to be under way than on its title. */
  protected seek(event: Event): void {
    const video = event.target as HTMLVideoElement;
    if (Number.isFinite(video.duration) && video.duration > 2) {
      video.currentTime = video.duration / 2;
    }
  }

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    effect(() => {
      const next: Picture = { cover: this.cover(), clip: prefersStill(host) ? null : this.clip() };
      const layers = untracked(this.layers);
      const front = untracked(this.front);
      const shown = layers[front];
      if (!shown) {
        this.layers.set([next, null]);
        return;
      }
      const under = 1 - front;
      const same = (picture: Picture | null | undefined): boolean =>
        picture?.cover === next.cover && picture.clip === next.clip;
      if (
        same(untracked(this.leaving) === front ? NOTHING : shown) ||
        (same(layers[under]) && untracked(this.loading) === under)
      ) {
        return;
      }
      clearTimeout(this.patience);
      if (!next.cover && !next.clip) {
        this.loading.set(null);
        if (prefersStill(host)) {
          this.leaving.set(null);
          this.layers.set(front === 0 ? [NOTHING, null] : [null, NOTHING]);
        } else {
          this.leaving.set(front);
          this.layers.set(front === 0 ? [shown, null] : [null, shown]);
        }
        return;
      }
      if (untracked(this.leaving) === under) {
        this.leaving.set(null);
      }
      this.layers.set(front === 0 ? [shown, next] : [next, shown]);
      this.loading.set(under);
      if (next.clip) {
        this.patience = setTimeout(() => {
          this.show(under);
        }, CLIP_PATIENCE);
      } else if (next.cover) {
        const cover = new Image();
        cover.onload = cover.onerror = (): void => {
          this.show(under);
        };
        cover.src = next.cover;
      }
    });

    const observer = new ResizeObserver(() => {
      // The hero around it is a grid that folds to one column, the text above the pile.
      const columns = host.parentElement
        ? getComputedStyle(host.parentElement).gridTemplateColumns.split(' ').length
        : 2;
      const url = heroMask(host.clientWidth, host.clientHeight, columns < 2);
      if (url) {
        this.mask.set(`url(${url})`);
        this.maskSize.set(`${String(host.clientWidth)}px ${String(host.clientHeight)}px`);
      }
    });
    observer.observe(host);
    inject(DestroyRef).onDestroy(() => {
      observer.disconnect();
      clearTimeout(this.patience);
    });
  }
}
