import {
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
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AvatarComponent, ChipComponent, FitTextDirective, MarkComponent } from '@naucto/ui';

import { diskStyleFor } from '../game-card/disk-style';
import { FloppyComponent } from '../game-card/floppy.component';
import { dockFits, dockPose, restPose } from './dock';
import type { HubGame } from './hub-game';

/** The plate's height: the pointer over it is on the plate, not on the disks. */
const PLATE = 116;
/** How far above the box the pointer still counts as on its disks, which rise past its top. */
const HEADROOM = 20;
/** How far inside the box the row of disks starts and ends. */
const ROW_INSET = 24;
/** The drag that moves the dock from one disk to the next. */
const DRAG_PER_DISK = 64;

interface Drag {
  id: number;
  x: number;
  y: number;
  from: number;
  axis: 'x' | null;
  mouse: boolean;
  /** Whether this press is also what opened the dock, so its click is not one on a disk. */
  opened: boolean;
  lastX: number;
  lastTime: number;
  speed: number;
}

/**
 * A collection as a box of disks over its name plate. At rest the disks stand in a row; reached by
 * the mouse, a finger or the keyboard they fan out along an arc with one at the crown, and a drag
 * or the arrow keys bring another there. Pressing a disk that is not at the crown brings it
 * there; pressing the one that is, is `picked`. The plate, and the tile for the games the box
 * does not show, open the collection.
 */
@Component({
  selector: 'nc-collection-box',
  imports: [
    RouterLink,
    TranslocoDirective,
    AvatarComponent,
    ChipComponent,
    FitTextDirective,
    FloppyComponent,
    MarkComponent,
  ],
  templateUrl: './collection-box.component.html',
  styleUrl: './collection-box.component.css',
  host: {
    class: 'relative block h-[290px] touch-pan-y select-none',
    '[class.docked]': 'docked()',
    '[class.nc-panning]': 'dragging()',
    '(pointerdown)': 'down($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'up($event)',
    '(pointercancel)': 'up($event)',
    '(pointerleave)': 'leave($event)',
    '(keydown)': 'onKey($event)',
    '(dragstart)': '$event.preventDefault()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionBoxComponent {
  readonly title = input.required<string>();
  readonly curator = input.required<{ id: number; username: string }>();
  /** The games the box may show, in order; it shows as many as fit. */
  readonly games = input.required<readonly HubGame[]>();
  /** How many games the collection holds, shown or not. */
  readonly total = input.required<number>();
  readonly link = input.required<string | readonly unknown[]>();
  /** The disk at the crown was pressed. */
  readonly picked = output<HubGame>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** The row's width; until it is measured, that of a box in a three-column grid. */
  private readonly rowWidth = signal(264);

  /** A collection that would run past the row is spread over it, one disk past what fits. */
  private readonly spread = computed(() => this.total() > dockFits(this.rowWidth()));
  protected readonly shown = computed(() =>
    (this.spread() ? this.games().slice(0, dockFits(this.rowWidth()) + 1) : this.games()).map(
      (game) => ({ game, disk: diskStyleFor(game) }),
    ),
  );
  protected readonly more = computed(() => this.total() - this.shown().length);
  /** Everything that rides the dock: the disks, then the tile for the rest. */
  private readonly count = computed(() => this.shown().length + (this.more() > 0 ? 1 : 0));

  /** The place on the dock that is at the crown; null while the box is at rest. */
  protected readonly focus = signal<number | null>(null);
  protected readonly docked = computed(() => this.focus() !== null);
  protected readonly dragging = signal(false);
  protected readonly crown = computed(() => {
    const focus = this.focus();
    return focus === null ? -1 : Math.round(focus);
  });
  protected readonly poses = computed(() => {
    const focus = this.focus();
    const row = this.rowWidth();
    return Array.from({ length: this.count() }, (_, index) => {
      const pose =
        focus === null
          ? restPose(index, this.shown().length, this.spread(), row)
          : dockPose(index, focus, row);
      return {
        left: pose.left,
        z: pose.z,
        transform: `translate(${String(pose.x)}px, ${String(pose.y)}px) scale(${pose.scale.toFixed(3)})`,
      };
    });
  });

  private drag: Drag | null = null;
  private hovered = false;
  private swallow = false;

  private place(target: EventTarget | null): number {
    const disk = target instanceof Element ? target.closest<HTMLElement>('[data-place]') : null;
    return Number(disk?.dataset.place ?? -1);
  }

  private open(place: number): void {
    this.focus.set(place < 0 ? Math.floor((this.count() - 1) / 2) : place);
  }

  /** Whether the keyboard is in the box, which keeps the dock open whatever the pointer does. */
  private heldByKeys(): boolean {
    const active = document.activeElement;
    return !!active && this.host.contains(active) && active.matches(':focus-visible');
  }

  private close(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.host.contains(active) && !this.heldByKeys()) {
      active.blur();
    }
    this.focus.set(null);
    this.dragging.set(false);
  }

  protected down(event: PointerEvent): void {
    const mouse = event.pointerType === 'mouse';
    if ((mouse && event.button !== 0) || (event.target as Element).closest('[data-plate]')) {
      return;
    }
    const wasOpen = this.focus() !== null;
    if (!wasOpen) {
      // A finger lands on the disk it wants; a mouse was already over the box, which opened it.
      this.open(mouse ? -1 : this.place(event.target));
    }
    this.drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      from: this.focus() ?? 0,
      axis: null,
      mouse,
      opened: !wasOpen && !mouse,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      speed: 0,
    };
  }

  protected move(event: PointerEvent): void {
    const mouse = event.pointerType === 'mouse';
    const box = this.host.getBoundingClientRect();
    const drag = this.drag;
    if (mouse) {
      this.hovered = true;
    }
    if (drag?.id !== event.pointerId) {
      if (mouse && !drag) {
        const onDisks = event.clientY >= box.top - HEADROOM && event.clientY <= box.bottom - PLATE;
        if (onDisks && this.focus() === null) {
          this.open(-1);
        } else if (!onDisks && this.focus() !== null && !this.heldByKeys()) {
          this.close();
        }
      }
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
        return;
      }
      if (!drag.mouse && Math.abs(dx) <= Math.abs(dy)) {
        // A vertical swipe is the page scrolling.
        this.drag = null;
        return;
      }
      drag.axis = 'x';
      this.host.setPointerCapture(drag.id);
      this.dragging.set(true);
    }
    const elapsed = event.timeStamp - drag.lastTime;
    if (elapsed > 0) {
      drag.speed = 0.6 * drag.speed + 0.4 * ((event.clientX - drag.lastX) / elapsed);
      drag.lastX = event.clientX;
      drag.lastTime = event.timeStamp;
    }
    this.focus.set(Math.max(-0.45, Math.min(this.count() - 0.55, drag.from - dx / DRAG_PER_DISK)));
  }

  protected up(event: PointerEvent): void {
    const drag = this.drag;
    if (drag?.id !== event.pointerId) {
      return;
    }
    this.drag = null;
    if (drag.axis) {
      this.dragging.set(false);
      // A flick carries on a little; a drag that had stopped lands where it is.
      const speed = event.timeStamp - drag.lastTime > 90 ? 0 : drag.speed;
      const landing = Math.round((this.focus() ?? 0) - (speed * 160) / DRAG_PER_DISK);
      this.focus.set(Math.max(0, Math.min(this.count() - 1, landing)));
      const box = this.host.getBoundingClientRect();
      const outside =
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top - HEADROOM ||
        event.clientY > box.bottom;
      if (drag.mouse && outside) {
        this.close();
      }
    }
    if (drag.axis || drag.opened) {
      this.swallow = true;
      setTimeout(() => {
        this.swallow = false;
      });
    }
  }

  protected leave(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') {
      return;
    }
    this.hovered = false;
    if (!this.drag && !this.heldByKeys()) {
      this.close();
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const place = this.place(document.activeElement);
    if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || place < 0) {
      return;
    }
    event.preventDefault();
    const next = Math.max(
      0,
      Math.min(this.count() - 1, place + (event.key === 'ArrowRight' ? 1 : -1)),
    );
    this.host.querySelector<HTMLElement>(`[data-place="${String(next)}"]`)?.focus();
  }

  protected onFocus(place: number): void {
    if (!this.drag) {
      this.focus.set(place);
    }
  }

  protected onBlur(event: FocusEvent): void {
    const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (!this.host.contains(next) && !this.drag && !this.hovered) {
      this.focus.set(null);
    }
  }

  constructor() {
    // In the capture phase: a press that only moved the dock must not reach the disk or the link.
    const onClick = (event: MouseEvent): void => {
      const place = this.place(event.target);
      const moves = place >= 0 && this.focus() !== null && place !== this.crown();
      if (this.swallow || moves) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (moves && !this.swallow) {
        this.focus.set(place);
      }
      this.swallow = false;
    };
    this.host.addEventListener('click', onClick, true);
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect.width) {
        this.rowWidth.set(Math.round(entry.contentRect.width) - 2 * ROW_INSET);
      }
    });
    observer.observe(this.host);
    inject(DestroyRef).onDestroy(() => {
      this.host.removeEventListener('click', onClick, true);
      observer.disconnect();
    });

    // A press anywhere else puts the disks back.
    effect((onCleanup) => {
      if (!this.docked()) {
        return;
      }
      const outside = (event: PointerEvent): void => {
        if (!this.host.contains(event.target as Node)) {
          this.focus.set(null);
        }
      };
      document.addEventListener('pointerdown', outside, true);
      onCleanup(() => {
        document.removeEventListener('pointerdown', outside, true);
      });
    });
  }
}
