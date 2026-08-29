import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { PresenceFlagComponent } from '@naucto/ui';

import { type Collaborator, WorkSessionService } from './work-session.service';

/**
 * How much a peer's pointer position means to you on this panel.
 *
 * - `shared` — everyone is looking at the same controls: an instrument's envelope, the session's
 *   permissions. Where somebody's pointer is tells you what they are about to change, so it is
 *   tracked.
 * - `isolated` — everyone is on their own object: their own sprite, their own corner of the map.
 *   A tracked position there is noise, because the coordinates mean something different to each
 *   of you. The flag fades in to say somebody is working in here and fades out when they leave.
 */
export type PresenceMode = 'shared' | 'isolated';

interface Flag {
  clientId: number;
  name: string;
  colour: Collaborator['colour'];
  x: number;
  y: number;
}

/**
 * Peers' cursors over a panel.
 *
 * Drop it inside any `relative` container and give it a surface key. It publishes the local
 * pointer against that key and renders everybody else's, so a panel opts into presence with one
 * line rather than by repeating the awareness plumbing.
 *
 * It listens on its parent rather than itself: the host is `pointer-events-none` so the controls
 * underneath stay usable, which means the host would never see a pointer event of its own.
 */
@Component({
  selector: 'nc-presence-surface',
  imports: [PresenceFlagComponent],
  template: `
    @for (f of flags(); track f.clientId) {
      <nc-presence-flag
        class="absolute"
        [style.left.px]="f.x"
        [style.top.px]="f.y"
        [name]="f.name"
        [colour]="f.colour"
      />
    }
  `,
  host: { class: 'pointer-events-none absolute inset-0 overflow-hidden' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PresenceSurfaceComponent {
  /** Awareness key for this panel, e.g. `sound:inspector`. Must be unique across the editor. */
  readonly surface = input.required<string>();
  readonly mode = input<PresenceMode>('shared');

  private readonly session = inject(WorkSessionService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /**
   * The panel's own scroll. Positions travel as content coordinates so they mean the same thing
   * to both people, and are turned back into panel coordinates here — otherwise a peer who has
   * scrolled sees everyone else's cursor displaced by however far they scrolled.
   */
  private readonly scroll = signal({ x: 0, y: 0 });

  protected readonly flags = computed<Flag[]>(() => {
    const here = this.session
      .collaborators()
      .filter((c) => !c.isSelf && c.cursor?.tab === this.surface());
    if (this.mode() === 'isolated') {
      // Presence, not position: stack them down the top-right corner in a stable order so a
      // second peer arriving does not shuffle the first one's flag.
      return here
        .slice()
        .sort((a, b) => a.clientId - b.clientId)
        .map((c, i) => ({
          clientId: c.clientId,
          name: c.name,
          colour: c.colour,
          x: 0,
          y: i * 30,
        }));
    }
    const s = this.scroll();
    return here.map((c) => ({
      clientId: c.clientId,
      name: c.name,
      colour: c.colour,
      x: (c.cursor?.x ?? 0) - s.x,
      y: (c.cursor?.y ?? 0) - s.y,
    }));
  });

  constructor() {
    const parent = this.host.nativeElement.parentElement;
    if (!parent) return;

    const move = (e: PointerEvent): void => {
      const r = parent.getBoundingClientRect();
      // Isolated surfaces publish a fixed point: peers only need to know somebody is in here, and
      // broadcasting a position nobody can interpret is bandwidth spent on noise.
      if (this.mode() === 'isolated') {
        this.session.setCursor({ tab: this.surface(), x: 0, y: 0 });
        return;
      }
      this.session.setCursor({
        tab: this.surface(),
        x: Math.round(e.clientX - r.left + parent.scrollLeft),
        y: Math.round(e.clientY - r.top + parent.scrollTop),
      });
    };
    const leave = (): void => {
      this.session.setCursor(null);
    };

    const scrolled = (): void => {
      this.scroll.set({ x: parent.scrollLeft, y: parent.scrollTop });
    };

    parent.addEventListener('pointermove', move);
    parent.addEventListener('pointerleave', leave);
    parent.addEventListener('scroll', scrolled, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      parent.removeEventListener('pointermove', move);
      parent.removeEventListener('pointerleave', leave);
      parent.removeEventListener('scroll', scrolled);
    });
  }
}
