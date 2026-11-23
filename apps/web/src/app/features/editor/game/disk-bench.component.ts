import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { projectControllerSetDisk } from '@naucto/api-client';
import { ButtonDirective, LabelComponent, SwatchPickerComponent, ToastService } from '@naucto/ui';

import { unwrap } from '../../../core/api/api-errors';
import { DiskNameComponent } from '../../../shared/game-card/disk-name.component';
import {
  diskBody,
  type DiskFinish,
  type DiskGradDir,
  type DiskStyle,
  diskStyleFor,
  ditherRamp,
} from '../../../shared/game-card/disk-style';
import { FloppyComponent } from '../../../shared/game-card/floppy.component';
import { injectProjectImage } from '../../../shared/queries/releases.queries';
import { ySignal } from '../../../shared/yjs/y-signal';
import { SessionSaveService } from '../work-session/session-save.service';
import { WorkSessionService } from '../work-session/work-session.service';

const FINISHES: readonly DiskFinish[] = [
  'solid',
  'stripes',
  'checker',
  'dots',
  'gradient',
  'gold',
  'silver',
  'holo',
];
const DIRECTIONS: readonly DiskGradDir[] = ['h', 'v', 'd', 'd2', 'r'];

/** A metal is a plastic of its own: the colour picked is kept, and shows on no part of the disk. */
const METALS: readonly DiskFinish[] = ['gold', 'silver', 'holo'];

/** How long the picks are let to settle before the last one is sent. */
const SEND_AFTER_MS = 300;

/** The side of a direction tile's swatch: sixteen cells of the dither. */
const SWATCH = 48;

const TILE = 'raised-sm grid cursor-pointer justify-items-center';
const TILE_OFF = `${TILE} text-ink-3 hover:bevel-lit hover:text-active-ink`;
const TILE_ON = `${TILE} bevel-down bevel-lit text-active-ink`;

/** A row of the game's palette as a picker offers it, and where the colour worn stands in it. */
interface Strip {
  colours: readonly string[];
  slots: readonly number[];
  at: number | null;
  /** The colour worn is one the palette no longer holds: it stands after the palette's own. */
  stray: boolean;
}

/** `kept` says the colour is one the author chose, and so one to show even off the palette. */
function stripOf(palette: readonly string[], worn: string, kept: boolean): Strip {
  const at = palette.indexOf(worn.toLowerCase());
  const stray = kept && at < 0;
  const colours = stray ? [...palette, worn] : palette;
  return {
    colours,
    slots: colours.map((_, i) => i),
    at: stray ? palette.length : at < 0 ? null : at,
    stray,
  };
}

/**
 * The Disk tab: the game's disk at full size, and beside it everything that changes it. The
 * colours offered are the game's own palette. Nothing is applied: a pick is the disk's style from
 * then on, as an uploaded cover is the cover.
 */
@Component({
  selector: 'nc-game-disk-bench',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DiskNameComponent,
    FloppyComponent,
    LabelComponent,
    SwatchPickerComponent,
  ],
  templateUrl: './disk-bench.component.html',
  host: { class: '@container block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiskBenchComponent {
  readonly name = input.required<string>();

  protected readonly session = inject(WorkSessionService);
  private readonly saves = inject(SessionSaveService);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  protected readonly cover = injectProjectImage(() => this.session.id);
  private readonly palette = ySignal(
    () => this.session.game.palette.map((colour) => colour.toLowerCase()),
    (cb) => this.session.game.onPaletteChange(cb),
  );
  /** The pick on its way to the server; `undefined` once the project holds it. */
  private readonly picked = signal<DiskStyle | null | undefined>(undefined);
  /** What the author chose, or null for the disk the game gets without a choice. */
  protected readonly chosen = computed<DiskStyle | null>(() => {
    const picked = this.picked();
    return picked === undefined ? (this.session.project()?.disk ?? null) : picked;
  });
  protected readonly style = computed(() =>
    diskStyleFor({ id: this.session.id, disk: this.chosen() }),
  );
  protected readonly metal = computed(() => METALS.includes(this.style().finish));
  /** Where a gradient ends and which way it runs, kept while the disk wears another finish. */
  private readonly ramp = linkedSignal<DiskStyle, { color2: string; gradDir: DiskGradDir }>({
    source: this.style,
    computation: (style, previous) =>
      style.finish === 'gradient' && style.color2
        ? { color2: style.color2, gradDir: style.gradDir ?? 'h' }
        : (previous?.value ?? {
            // Half the palette away from the body, which on a palette sorted by hue is its
            // opposite.
            color2:
              this.palette()[
                (Math.max(0, this.palette().indexOf(style.color)) + this.palette().length / 2) %
                  this.palette().length
              ] ?? style.color,
            gradDir: 'h',
          }),
  });
  protected readonly body = computed(() =>
    stripOf(this.palette(), this.style().color, this.chosen() !== null),
  );
  protected readonly runsTo = computed(() =>
    stripOf(this.palette(), this.ramp().color2, this.chosen()?.finish === 'gradient'),
  );

  /** The style with a change made to it; only a gradient carries a second colour and a direction. */
  private wearing(change: Partial<DiskStyle>): DiskStyle {
    const { color, finish } = { ...this.style(), ...change };
    return finish === 'gradient'
      ? {
          color,
          finish,
          color2: change.color2 ?? this.ramp().color2,
          gradDir: change.gradDir ?? this.ramp().gradDir,
        }
      : { color, finish };
  }

  /** The disk as it would be in each finish, for the tile that offers it. */
  protected readonly finishes = computed(() =>
    FINISHES.map((finish) => ({ finish, disk: this.wearing({ finish }) })),
  );
  protected readonly directions = computed(() =>
    DIRECTIONS.map((dir) => ({
      dir,
      swatch: `${ditherRamp(SWATCH, SWATCH, this.ramp().color2, dir)}, ${diskBody(this.style())}`,
    })),
  );

  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Counts the picks, so an answer about an earlier one does not settle a later one. */
  private turn = 0;

  private async send(disk: DiskStyle | null, turn: number): Promise<void> {
    this.timer = undefined;
    try {
      unwrap(await projectControllerSetDisk({ path: { id: this.session.id }, body: { disk } }));
      await this.saves.refreshProject();
    } catch {
      if (turn === this.turn) {
        this.toasts.show(this.transloco.translate('editor.game.disk.failed'), 'error');
      }
    }
    // Either way the project is what stands: the pick it now holds, or the one from before.
    if (turn === this.turn) {
      this.picked.set(undefined);
    }
  }

  protected set(disk: DiskStyle | null): void {
    this.picked.set(disk);
    const turn = ++this.turn;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.send(disk, turn);
    }, SEND_AFTER_MS);
  }

  protected wear(change: Partial<DiskStyle>): void {
    this.set(this.wearing(change));
  }

  /** Takes a colour of a strip as the body's or as where the gradient runs to. */
  protected paint(part: 'color' | 'color2', strip: Strip, slot: number | null): void {
    const colour = slot === null ? undefined : strip.colours[slot];
    if (colour) {
      this.wear({ [part]: colour });
    }
  }

  protected tileClass(on: boolean): string {
    return on ? TILE_ON : TILE_OFF;
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      const waiting = this.picked();
      if (this.timer !== undefined && waiting !== undefined) {
        clearTimeout(this.timer);
        void this.send(waiting, this.turn);
      }
    });
  }
}
