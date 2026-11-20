import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  AvatarComponent,
  FitTextDirective,
  formatCompact,
  PagerComponent,
  ScrambleDirective,
  StatComponent,
} from '@naucto/ui';

import { FloppyComponent } from '../game-card/floppy.component';
import { HeroBackdropComponent } from './hero-backdrop.component';
import type { HubGame } from './hub-game';

export interface HeroEntry {
  /** Why this game is here, as the line above its name. */
  reason: string;
  game: HubGame;
  /** The viewer's own game, which needs no byline. */
  mine?: boolean;
}

/** How far a drag travels to move the pile by one disk. */
const DRAG_PER_DISK = 80;
/** A wheel moves the pile once it has turned this far, and then not again for a while. */
const WHEEL_STEP = 40;
const WHEEL_LOCK = 440;
/** Wheel events further apart than this are two gestures, not one. */
const WHEEL_GAP = 220;

interface Swipe {
  x: number;
  y: number;
  from: number;
  id: number;
  mouse: boolean;
  axis: 'x' | 'y' | null;
}

/**
 * The hub's hero: a few featured games as a fanned pile of disks, the one in front told on the
 * left over its own cover or clip. The pile is moved by the wheel, a drag, the arrow keys, Home
 * and End, its dots, or by pressing a disk behind; pressing the one in front is `picked`.
 *
 * What is read to a screen reader is one status line; the name and description that change
 * through a scramble are hidden from it.
 */
@Component({
  selector: 'nc-hero-pile',
  imports: [
    TranslocoDirective,
    AvatarComponent,
    FitTextDirective,
    FloppyComponent,
    HeroBackdropComponent,
    PagerComponent,
    ScrambleDirective,
    StatComponent,
  ],
  templateUrl: './hero-pile.component.html',
  host: { class: 'block min-w-0', '(keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroPileComponent {
  readonly entries = input.required<readonly HeroEntry[]>();
  /** The disk in front, from 0. */
  readonly index = model(0);
  /** The disk in front was pressed. */
  readonly picked = output<HubGame>();

  protected readonly current = computed(() =>
    Math.max(0, Math.min(this.index(), this.entries().length - 1)),
  );
  protected readonly entry = computed(() => this.entries()[this.current()]);
  protected readonly names = computed(() => this.entries().map((entry) => entry.game.name));
  protected readonly formatCompact = formatCompact;

  /** Each disk by how far it is from the front: fanned out, smaller, dimmer. */
  protected readonly cards = computed(() =>
    this.entries().map((entry, i) => {
      const offset = i - this.current();
      const far = Math.abs(offset);
      const side = Math.sign(offset);
      return {
        entry,
        front: offset === 0,
        z: 10 - far,
        transform: `translate(${String(side * far * 92)}px, ${String(-far * 30)}px) rotate(${String(side * far * 6)}deg) scale(${(1 - far * 0.14).toFixed(3)})`,
        opacity: offset ? Math.max(0.45, 1 - far * 0.18) : 1,
        filter: `brightness(${String(Math.max(0.3, 1 - far * 0.24))}) saturate(${String(Math.max(0.4, 1 - far * 0.2))})`,
      };
    }),
  );

  protected readonly dragging = signal(false);
  private swipe: Swipe | null = null;
  private swiped = false;
  private wheel = { turned: 0, at: 0, lockedUntil: 0 };

  protected go(index: number): void {
    this.index.set(Math.max(0, Math.min(this.entries().length - 1, index)));
  }

  protected pick(index: number, game: HubGame): void {
    if (index === this.current()) {
      this.picked.emit(game);
    } else {
      this.go(index);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const to: Record<string, number> = {
      ArrowRight: this.current() + 1,
      ArrowDown: this.current() + 1,
      ArrowLeft: this.current() - 1,
      ArrowUp: this.current() - 1,
      Home: 0,
      End: this.entries().length - 1,
    };
    const index = to[event.key];
    if (index !== undefined) {
      event.preventDefault();
      this.go(index);
    }
  }

  protected onWheel(event: WheelEvent): void {
    const turn = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!turn) {
      return;
    }
    const direction = Math.sign(turn);
    const now = performance.now();
    const locked = now < this.wheel.lockedUntil;
    const atEnd =
      (direction < 0 && this.current() === 0) ||
      (direction > 0 && this.current() === this.entries().length - 1);
    // Past either end the wheel is the page's again, but not on the tail of the turn that got there.
    if (atEnd && !locked) {
      return;
    }
    event.preventDefault();
    if (locked) {
      return;
    }
    if (now - this.wheel.at > WHEEL_GAP) {
      this.wheel.turned = 0;
    }
    this.wheel.at = now;
    this.wheel.turned += turn;
    if (Math.abs(this.wheel.turned) >= WHEEL_STEP) {
      this.wheel.turned = 0;
      this.wheel.lockedUntil = now + WHEEL_LOCK;
      this.go(this.current() + direction);
    }
  }

  protected down(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || event.button === 0) {
      this.swipe = {
        x: event.clientX,
        y: event.clientY,
        from: event.clientX,
        id: event.pointerId,
        mouse: event.pointerType === 'mouse',
        axis: null,
      };
    }
  }

  protected move(event: PointerEvent): void {
    const swipe = this.swipe;
    if (!swipe) {
      return;
    }
    if (!swipe.axis) {
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      if (Math.abs(dx) < (swipe.mouse ? 5 : 8) && Math.abs(dy) < 8) {
        return;
      }
      swipe.axis = swipe.mouse || Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (swipe.axis === 'x') {
        (event.currentTarget as HTMLElement).setPointerCapture(swipe.id);
        this.dragging.set(true);
      }
    }
    const travelled = event.clientX - swipe.from;
    if (swipe.axis === 'x' && Math.abs(travelled) >= DRAG_PER_DISK) {
      swipe.from += Math.sign(travelled) * DRAG_PER_DISK;
      this.go(this.current() - Math.sign(travelled));
    }
  }

  protected up(): void {
    if (this.swipe?.axis === 'x') {
      // The click that ends a drag is not a press on the disk under it.
      this.swiped = true;
      setTimeout(() => {
        this.swiped = false;
      });
    }
    this.swipe = null;
    this.dragging.set(false);
  }

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const onClick = (event: MouseEvent): void => {
      if (this.swiped) {
        this.swiped = false;
        event.preventDefault();
        event.stopPropagation();
      }
    };
    host.addEventListener('click', onClick, true);
    inject(DestroyRef).onDestroy(() => {
      host.removeEventListener('click', onClick, true);
    });
  }
}
