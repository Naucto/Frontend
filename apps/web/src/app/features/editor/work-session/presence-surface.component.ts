import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { PresenceLayerComponent, type PresenceMark, type PresenceViewport } from '@naucto/ui';

import { SessionPresenceService } from './session-presence.service';

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
  imports: [PresenceLayerComponent],
  template: `
    <nc-presence-layer [marks]="marks()" [viewport]="viewPx()" />
  `,
  host: { class: 'pointer-events-none absolute inset-0 overflow-hidden' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PresenceSurfaceComponent {
  /** Awareness key for this panel, e.g. `sound:inspector`. Must be unique across the editor. */
  readonly surface = input.required<string>();

  private readonly presence = inject(SessionPresenceService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /**
   * The panel's own scroll. Positions travel as content coordinates so they mean the same thing
   * to both people, and are turned back into panel coordinates here — otherwise a peer who has
   * scrolled sees everyone else's cursor displaced by however far they scrolled.
   */
  private readonly scroll = signal({ x: 0, y: 0 });
  private readonly box = signal({ w: 0, h: 0 });

  protected readonly marks = computed<PresenceMark[]>(() => {
    const here = this.presence
      .collaborators()
      .filter(
        (collaborator) => !collaborator.isSelf && collaborator.cursor?.tab === this.surface(),
      );
    const scroll = this.scroll();
    return here.map((collaborator) => ({
      id: collaborator.clientId,
      name: collaborator.name,
      colour: collaborator.colour,
      x: (collaborator.cursor?.x ?? 0) - scroll.x,
      y: (collaborator.cursor?.y ?? 0) - scroll.y,
    }));
  });
  /** The panel as it is seen. Positions are already relative to it, so the frame starts at zero. */
  protected readonly viewPx = computed<PresenceViewport>(() => ({ x: 0, y: 0, ...this.box() }));

  constructor() {
    const destroyRef = inject(DestroyRef);
    // A node projected into a component is attached only after the creation pass.
    afterNextRender(() => {
      const parent = this.host.nativeElement.parentElement;
      if (!parent) {
        return;
      }

      const move = (event: PointerEvent): void => {
        const rect = parent.getBoundingClientRect();
        this.presence.setCursor({
          tab: this.surface(),
          x: Math.round(event.clientX - rect.left + parent.scrollLeft),
          y: Math.round(event.clientY - rect.top + parent.scrollTop),
        });
      };
      const leave = (): void => {
        this.presence.setCursor(null);
      };

      const scrolled = (): void => {
        this.scroll.set({ x: parent.scrollLeft, y: parent.scrollTop });
      };

      const ro = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (rect) {
          this.box.set({ w: rect.width, h: rect.height });
        }
      });
      ro.observe(parent);

      parent.addEventListener('pointermove', move);
      parent.addEventListener('pointerleave', leave);
      parent.addEventListener('scroll', scrolled, { passive: true });
      destroyRef.onDestroy(() => {
        ro.disconnect();
        parent.removeEventListener('pointermove', move);
        parent.removeEventListener('pointerleave', leave);
        parent.removeEventListener('scroll', scrolled);
      });
    });
  }
}
