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
import { TranslocoPipe } from '@jsverse/transloco';
import type { TouchControl } from '@naucto/engine';
import { MarkComponent } from '@naucto/ui';

import { PadSettingsStore } from './pad-settings.store';

/** A key at 100 %: below that a thumb misses more often than it hits. */
const KEY = 56;
/** One kit pixel between two keys. */
const GAP = 3;
/** The pad's margin, which is also the least room between the cross and the diamond. */
const INSET = 16;
/** The smallest key that holds its legend at the size the legend is drawn for. */
const LEGEND_KEY = 27;
/** The narrowest Start that holds its word. */
const START_WORD = 63;

/** The cross and the diamond, each control at its cell of the pad's grid. */
const CROSS = [
  { control: 'dpad-up', at: 'col-start-2 row-start-[r1]', mark: 'arrow-up', label: 'up' },
  { control: 'dpad-left', at: 'col-start-1 row-start-[r2]', mark: 'arrow-left', label: 'left' },
  { control: 'dpad-right', at: 'col-start-3 row-start-[r2]', mark: 'arrow-right', label: 'right' },
  { control: 'dpad-down', at: 'col-start-2 row-start-[r3]', mark: 'arrow-down', label: 'down' },
] as const;

const FACES = [
  { control: 'y', at: 'col-start-6 row-start-[r1]', legend: 'Y' },
  { control: 'x', at: 'col-start-5 row-start-[r2]', legend: 'X' },
  { control: 'b', at: 'col-start-7 row-start-[r2]', legend: 'B' },
  { control: 'a', at: 'col-start-6 row-start-[r3]', legend: 'A' },
] as const;

/**
 * The on-screen pad for a touch device, drawn as a gamepad: a cross on the left, the four face
 * buttons in their diamond on the right, Start low between them, in the corners both leave empty.
 * Only the controls the running game plugs an action into are drawn, each at the place it has on
 * a pad.
 *
 * It draws only the controls; `TouchSource` reads them by hit-testing `data-nc-control`, so the
 * pad has no idea a game exists and the engine has no idea what the pad looks like. Two layouts,
 * chosen by orientation: a zone under the screen in portrait, an overlay on the screen's edges in
 * landscape, where there is no room for a zone.
 *
 * A legend is drawn at its own size or not at all: a key too small to hold it is left blank.
 */
@Component({
  selector: 'nc-virtual-pad',
  imports: [MarkComponent, TranslocoPipe],
  templateUrl: './virtual-pad.component.html',
  host: { '[class]': "overlay() ? 'pointer-events-none absolute inset-0' : 'block'" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VirtualPadComponent {
  /** The controls to draw: those the running game uses. */
  readonly controls = input.required<readonly TouchControl[]>();
  /** Overlay the screen (landscape) instead of taking a zone under it (portrait). */
  readonly overlay = input(false);
  /** How much smaller than life the pad is drawn, where it is shown rather than played. */
  readonly zoom = input(1);
  /** The element `TouchSource` binds to. */
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly settings = inject(PadSettingsStore);
  protected readonly cross = computed(() =>
    CROSS.filter((arm) => this.controls().includes(arm.control)),
  );
  protected readonly faces = computed(() =>
    FACES.filter((button) => this.controls().includes(button.control)),
  );
  /** The room the pad is given, once it has been laid out. */
  private readonly room = signal<{ width: number; height: number } | null>(null);
  /**
   * Every length of the pad, in whole pixels. A key is as large as the device is set to, and no
   * larger than lets the cross and the diamond stand side by side in the room the pad has: a
   * narrow phone gets smaller keys, never keys that overlap or leave the screen.
   */
  protected readonly layout = computed(() => {
    const zoom = this.zoom();
    const gap = Math.max(1, Math.round(GAP * zoom));
    const inset = Math.round(INSET * zoom);
    const room = this.room();
    const across = room ? Math.floor((room.width - 3 * inset - 6 * gap) / 6) : Infinity;
    const down =
      room && this.overlay() ? Math.floor((room.height - 2 * inset - 4 * gap) / 3) : Infinity;
    const key = Math.max(1, Math.min(Math.round(KEY * this.settings.scale() * zoom), across, down));
    const legends = key >= LEGEND_KEY;
    const tall = Math.round((key * 3) / 4);
    const wide = Math.max(2 * tall, legends ? START_WORD : 0);
    // Start is centred between the cross and the diamond: one pixel wider where the room left
    // over is odd, so it stands on a whole pixel.
    const over = room ? (room.width - 2 * inset - 4 * key - 4 * gap - wide) % 2 : 0;

    return { key, gap, inset, legends, start: { tall, wide: wide + Math.abs(over) } };
  });

  protected readonly key =
    'pointer-events-auto flex items-center justify-center raised-sm text-ui text-ink-body active:bevel-down active:bevel-primary active:text-on-primary';
  protected readonly face = `${this.key} font-mono`;

  constructor() {
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect.width) {
        this.room.set({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(this.element);
    inject(DestroyRef).onDestroy(() => {
      observer.disconnect();
    });
  }
}
