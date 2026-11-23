import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { formatCompact, IconComponent, type IconName, inkFor, prefersStill } from '@naucto/ui';

import { diskBody, diskFinish, type DiskStyle, luminance, PLAIN_DISK } from './disk-style';

/** What the disk offers once it is reached. `new` is the disk that does not exist yet. */
export type FloppyAction = 'none' | 'play' | 'edit' | 'new' | 'join';
/** `bandBottom` lays the author and the counts along the bottom of the label. */
export type FloppyInfo = 'none' | 'bandBottom';

/** Something stuck on the disk, placed by its centre in percent of the disk. */
export type FloppySticker = {
  x: number;
  y: number;
  /** Degrees. */
  rotation: number;
  /** Not there yet: a player waits enlarged above the disk, a seat is simply absent. */
  hidden?: boolean;
} & (
  | {
      /** A seat nobody has taken: a dashed outline. */
      seat: true;
    }
  | {
      seat?: false;
      /** A player's initial, or `+3` for those who did not fit. */
      initial: string;
      color: string;
      host?: boolean;
    }
);

/** The shape of a disk, as CSS `aspect-ratio`. */
export const DISK_RATIO = '1 / 1.02';

const ACTION_ICON: Partial<Record<FloppyAction, IconName>> = {
  play: 'play',
  edit: 'edit',
  join: 'login',
};

type Vector = [number, number, number];

function unit([x, y, depth]: Vector): Vector {
  const length = Math.hypot(x, y, depth);
  return [x / length, y / length, depth / length];
}

function dot(a: Vector, b: Vector): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function compact(count: number | null): string | null {
  return count === null ? null : formatCompact(count);
}

/** One fixed lamp, above and to the left of the viewer, and the direction halfway to the eye. */
const LAMP = unit([-0.45, -0.75, 1]);
const HALFWAY = unit([LAMP[0], LAMP[1], LAMP[2] + 1]);

/**
 * The order in which the cells of a 12px dither tile come on, as the offset of each: the first
 * cells give the faint rim of the reflection, all sixteen its solid core.
 */
const SHINE_CELLS = [
  [0, 0],
  [6, 6],
  [6, 0],
  [0, 6],
  [3, 3],
  [9, 9],
  [9, 3],
  [3, 9],
  [3, 0],
  [9, 6],
  [9, 0],
  [3, 6],
  [0, 3],
  [6, 9],
  [6, 3],
  [0, 9],
].map(([x, y]) => `${String(x)}px ${String(y)}px`);

/**
 * A game as a 3.5" disk: its cover is the label, and its name is never printed on it. Reached by
 * the pointer, the disk lifts and leans
 * toward it under a fixed lamp, the shutter slides onto the window, the preview plays over the
 * cover and the action shows. `open` is that same state for the keyboard, without the lean.
 *
 * It is a picture, not a control: the link around it is the caller's, and an `a` that holds one
 * opens it on `:focus-visible` with nothing to bind. Only `join` answers a press of its own,
 * through `acted`. What is projected is pinned to the corner of the cover.
 */
@Component({
  selector: 'nc-floppy',
  imports: [IconComponent],
  templateUrl: './floppy.component.html',
  styleUrl: './floppy.component.css',
  host: {
    '[class.band]': 'info() === "bandBottom"',
    '[class.new]': 'action() === "new"',
    '[class.open]': 'open()',
    '[class.interactive]': 'interactive()',
    '[class.lit]': 'lit()',
    '[class.pale]': 'pale()',
    '[style.--f-body]': 'action() === "new" ? null : body()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloppyComponent {
  /** What the `new` disk says it makes. */
  readonly caption = input('');
  readonly disk = input<DiskStyle>(PLAIN_DISK);
  readonly cover = input<string | null>(null);
  /** A clip that plays over the cover while the disk is reached. */
  readonly preview = input<string | null>(null);
  readonly info = input<FloppyInfo>('none');
  readonly by = input('');
  readonly likes = input<number | null>(null);
  readonly comments = input<number | null>(null);
  readonly stickers = input<FloppySticker[]>([]);
  readonly action = input<FloppyAction>('none');
  readonly open = input(false, { transform: booleanAttribute });
  /** Whether the pointer reaches it. A disk that is not interactive still answers `open`. */
  readonly interactive = input(true, { transform: booleanAttribute });
  /** The `join` action was pressed; the press goes no further than the disk. */
  readonly acted = output();

  protected readonly ACTION_ICON = ACTION_ICON;
  protected readonly inkFor = inkFor;
  protected readonly DISK_RATIO = DISK_RATIO;
  protected readonly SHINE_CELLS = SHINE_CELLS;

  protected readonly likesText = computed(() => compact(this.likes()));
  protected readonly commentsText = computed(() => compact(this.comments()));
  /** Lifted off the page, however little: the sides and the lighting exist only while it is. */
  protected readonly lit = signal(false);
  private readonly width = signal(0);
  protected readonly body = computed(() => diskBody(this.disk()));
  protected readonly finish = computed(() =>
    this.action() === 'new' ? null : diskFinish(this.disk(), this.width()),
  );
  /** The band is the plastic darkened; on a pale plastic it is still light enough for dark ink. */
  protected readonly pale = computed(() => luminance(this.body()) * 0.72 > 0.4);

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  /** A mouse is over the disk. A touch never leans it. */
  private pointed = false;
  private pointerX = 0.5;
  private pointerY = 0.5;
  /** How far the disk has lifted, 0 to 1. */
  private lift = 0;
  private frame = 0;

  protected press(event: Event): void {
    if (this.action() === 'join') {
      event.preventDefault();
      event.stopPropagation();
      this.acted.emit();
    }
  }

  /**
   * The lean follows the pointer: the point under it is pressed away. The light is Lambert diffuse
   * and Blinn-Phong specular from the one lamp, handed to the stylesheet as custom properties.
   */
  private paint(): void {
    const leanY = (this.pointerX - 0.5) * 44 * this.lift;
    const leanX = (0.5 - this.pointerY) * 36 * this.lift;
    const sinY = Math.sin((leanY * Math.PI) / 180);
    const cosY = Math.cos((leanY * Math.PI) / 180);
    const sinX = Math.sin((leanX * Math.PI) / 180);
    const cosX = Math.cos((leanX * Math.PI) / 180);
    const normal: Vector = [sinY, -sinX * cosY, cosX * cosY];
    const diffuse = dot(normal, LAMP) - LAMP[2];
    const specular = Math.max(0, dot(normal, HALFWAY)) ** 30;
    // An edge of the shell, by where it faces once the disk has leaned.
    const edge = ([x, y, depth]: Vector): string => {
      const turned = -x * sinY + depth * cosY;
      const facing: Vector = [
        x * cosY + depth * sinY,
        y * cosX - turned * sinX,
        y * sinX + turned * cosX,
      ];
      const lightness = Math.max(0.18, Math.min(1, 0.3 + 0.75 * Math.max(0, dot(facing, LAMP))));
      return `${String(Math.round(lightness * 78))}%`;
    };
    const style = this.element.style;
    style.setProperty('--f-lift', this.lift.toFixed(3));
    style.setProperty('--f-lean-x', `${leanX.toFixed(2)}deg`);
    style.setProperty('--f-lean-y', `${leanY.toFixed(2)}deg`);
    style.setProperty('--f-top', edge([0, -1, 0]));
    style.setProperty('--f-bottom', edge([0, 1, 0]));
    style.setProperty('--f-left', edge([-1, 0, 0]));
    style.setProperty('--f-right', edge([1, 0, 0]));
    style.setProperty(
      '--f-diffuse',
      diffuse >= 0
        ? `rgb(255 255 255 / ${Math.min(0.35, diffuse * 1.1).toFixed(3)})`
        : `rgb(0 0 0 / ${Math.min(0.45, -diffuse * 1.3).toFixed(3)})`,
    );
    style.setProperty('--f-shine', Math.min(0.92, 0.45 + specular * 0.7).toFixed(3));
    style.setProperty('--f-shine-x', `${(50 + (HALFWAY[0] - normal[0]) * 160).toFixed(1)}%`);
    style.setProperty('--f-shine-y', `${(50 + (HALFWAY[1] - normal[1]) * 160).toFixed(1)}%`);
    style.setProperty('--f-rim-x', `${(-normal[0] * 6).toFixed(1)}px`);
    style.setProperty('--f-rim-y', `${(-normal[1] * 6).toFixed(1)}px`);
  }

  /**
   * Bring the preview and the lift in line with whether the disk is reached. Lift and lean are
   * eased together, so the disk never snaps flat when the pointer leaves.
   */
  private settle(): void {
    const reached = this.pointed && this.interactive();
    const video = this.video()?.nativeElement;
    if (video && (reached || this.open()) && !prefersStill(this.element)) {
      // A refused autoplay leaves the cover in place, which is the right fallback.
      video.play().catch(() => undefined);
    } else if (video) {
      video.pause();
      video.currentTime = 0;
    }

    const to = reached && !prefersStill(this.element) ? 1 : 0;
    const from = this.lift;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lit.set(to > 0 || from > 0);
    if (to === from) {
      return;
    }
    const start = performance.now();
    const duration = (to ? 240 : 360) * Math.abs(to - from);
    const step = (now: number): void => {
      const progress = Math.min(1, (now - start) / duration);
      this.lift = from + (to - from) * (1 - (1 - progress) ** 3);
      this.paint();
      if (progress < 1) {
        this.frame = requestAnimationFrame(step);
      } else {
        this.frame = 0;
        this.lit.set(to > 0);
      }
    };
    this.frame = requestAnimationFrame(step);
  }

  constructor() {
    const host = this.element;
    // Bound by hand: a template listener would schedule a change detection on every pointer move,
    // and nothing here is the template's to redraw.
    const lean = (event: PointerEvent): void => {
      if (!this.lift && !this.frame) {
        return;
      }
      const box = host.getBoundingClientRect();
      this.pointerX = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
      this.pointerY = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
      if (!this.frame) {
        this.paint();
      }
    };
    const enter = (event: PointerEvent): void => {
      this.pointed = event.pointerType === 'mouse';
      this.settle();
      lean(event);
    };
    const leave = (): void => {
      this.pointed = false;
      this.settle();
    };
    host.addEventListener('pointermove', lean, { passive: true });
    host.addEventListener('pointerenter', enter);
    host.addEventListener('pointerleave', leave);

    const observer = new ResizeObserver(() => {
      this.width.set(Math.round(host.clientWidth));
    });
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.frame);
      host.removeEventListener('pointermove', lean);
      host.removeEventListener('pointerenter', enter);
      host.removeEventListener('pointerleave', leave);
      observer.disconnect();
    });

    afterRenderEffect(() => {
      observer.disconnect();
      // Only a gradient is drawn to the disk's size; no other finish needs it measured.
      if (this.disk().finish === 'gradient') {
        observer.observe(host);
      }
    });

    effect(() => {
      this.interactive();
      this.open();
      this.video();
      this.settle();
    });
  }
}
