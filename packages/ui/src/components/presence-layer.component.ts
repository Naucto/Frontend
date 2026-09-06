import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { type IconName } from '../icons/paths';
import { type PresenceColour } from './avatar.component';
import { IconComponent } from './icon.component';
import { PresenceFlagComponent } from './presence-flag.component';

/** Somebody's pointer, in the coordinates of whatever content the layer is laid over. */
export interface PresenceMark {
  id: number;
  name: string;
  colour: PresenceColour;
  x: number;
  y: number;
}

/** What of that content is on screen, in the same coordinates. */
export interface PresenceViewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Edge = 'up' | 'down' | 'left' | 'right';
type Placed = PresenceMark & { edge: Edge | null };

const ARROW: Record<Edge, IconName> = {
  up: 'arrow-up',
  down: 'arrow-down',
  left: 'arrow-left',
  right: 'arrow-right',
};

const FILL: Record<PresenceColour, string> = {
  sky: 'bg-presence-sky',
  blush: 'bg-presence-blush',
  jade: 'bg-presence-jade',
};

/** Room for the chip itself, so it lands wholly inside the frame rather than half over its rim. */
const PAD_X = 46;
const PAD_Y = 14;

/**
 * Everybody else's pointers over a surface bigger than the frame that shows it.
 *
 * A peer inside the frame is a cursor where they are. A peer outside it is a chip on the rim,
 * where the line from the middle of the frame to them crosses it — so the chip says which way to
 * scroll to find them. Without it a peer working anywhere but your own corner simply is not
 * there, which reads as nobody being in the room.
 *
 * The host is `display: contents`, so the marks position against whatever `relative` box the
 * caller already has; give it coordinates in that box and nothing else.
 */
@Component({
  selector: 'nc-presence-layer',
  imports: [IconComponent, PresenceFlagComponent],
  template: `
    @for (m of placed(); track m.id) {
      @if (m.edge; as dir) {
        <div
          class="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 px-[5px] py-[2px] font-mono text-micro whitespace-nowrap uppercase tracking-tag text-on-accent transition-[left,top] duration-100 ease-out"
          [class]="fill(m.colour)"
          [style.left.px]="m.x"
          [style.top.px]="m.y"
        >
          <nc-icon [name]="arrow(dir)" [size]="12" />
          <span class="max-w-[84px] overflow-hidden text-ellipsis">{{ m.name }}</span>
        </div>
      } @else {
        <nc-presence-flag
          class="absolute"
          [style.left.px]="m.x"
          [style.top.px]="m.y"
          [name]="m.name"
          [colour]="m.colour"
        />
      }
    }
  `,
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PresenceLayerComponent {
  readonly marks = input<readonly PresenceMark[]>([]);
  /** Null when the whole content is on screen, and every mark is therefore a cursor. */
  readonly viewport = input<PresenceViewport | null>(null);

  protected readonly placed = computed(() => this.marks().map((m) => place(m, this.viewport())));

  protected fill(colour: PresenceColour): string {
    return FILL[colour];
  }

  protected arrow(edge: Edge): IconName {
    return ARROW[edge];
  }
}

/** Where a mark is drawn, and whether it is drawn as a cursor or as a chip on the rim. */
export function place(mark: PresenceMark, v: PresenceViewport | null): Placed {
  if (!v || (mark.x >= v.x && mark.x < v.x + v.w && mark.y >= v.y && mark.y < v.y + v.h)) {
    return { ...mark, edge: null };
  }
  const cx = v.w / 2;
  const cy = v.h / 2;
  const dx = mark.x - v.x - cx;
  const dy = mark.y - v.y - cy;
  // How far along the ray to the peer the rim is. Whichever side it meets first wins, and a frame
  // too small to hold the chip collapses it to the middle rather than pushing it outside.
  const kx = Math.abs(dx) > 0.001 ? (cx - PAD_X) / Math.abs(dx) : Infinity;
  const ky = Math.abs(dy) > 0.001 ? (cy - PAD_Y) / Math.abs(dy) : Infinity;
  const k = Math.max(0, Math.min(kx, ky));
  return {
    ...mark,
    x: v.x + cx + dx * k,
    y: v.y + cy + dy * k,
    edge: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up',
  };
}
