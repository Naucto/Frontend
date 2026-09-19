import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, unwrap } from '@app/core/api/api-errors';
import {
  injectProjectCheckpoints,
  injectProjectLimits,
  injectProjectVersions,
  invalidateProjectHistory,
  type VersionRow,
} from '@app/shared/queries/projects.queries';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  type CheckpointLimitDto,
  projectControllerDeleteCheckpoint,
  projectControllerDeleteVersion,
  projectControllerGetCheckpoint,
  projectControllerGetVersion,
  projectControllerSaveCheckpoint,
} from '@naucto/api-client';
import { computeSizeReport } from '@naucto/engine';
import {
  ButtonDirective,
  IconComponent,
  InputDirective,
  MeterComponent,
  PopoverDirective,
  PopoverPanelComponent,
  RelativeTimePipe,
  ToastService,
} from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';
import * as Y from 'yjs';

import { WorkSessionService } from '../work-session/work-session.service';
import { PUBLISH_CEILING } from './publish.dialog';

interface HistoryRow extends VersionRow {
  /** v1, v2 … for releases; 0 for autosaves. */
  index: number;
}

/** Newest first; entries with no date sort last. */
const byWhen = (a: VersionRow, b: VersionRow): number => (b.when ?? '').localeCompare(a.when ?? '');

/** Header chip "Platformer v3 · 942 KB" → versions, autosaves and the size budget. */
@Component({
  selector: 'nc-versions-popover',
  imports: [
    FormsModule,
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    InputDirective,
    MeterComponent,
    PopoverDirective,
    PopoverPanelComponent,
    RelativeTimePipe,
  ],
  template: `
    <ng-container *transloco="let t">
      <button
        type="button"
        [ncPopover]="panel"
        [(popoverOpen)]="open"
        class="-ms-[11px] flex items-center gap-1.25 rounded-sm border bg-raised px-1.5 py-0.75 text-ui tracking-[0.04em] text-ink"
        [class]="open() ? 'border-gold' : 'border-line hover:border-line-strong'"
      >
        <span class="max-w-[24ch] truncate">{{ session.project()?.name || 'Untitled game' }}</span>
        <!-- The newest name, never a count: a count moved on every autosave and every delete, and
             said nothing about what the game is at. -->
        <span class="max-w-[16ch] truncate font-mono text-meta tracking-tag text-ink-3">
          {{ newest()?.name ?? t('editor.game.unversioned') }}
        </span>
        <nc-icon name="chevron-down" [size]="12" class="text-ink-3" />
      </button>
      <!-- The design only shows the size when the game is near its ceiling. -->
      @if (sizeTone(); as tone) {
        <!-- The diamond the design puts here. It was a save glyph, chosen because nobody found a
             diamond in the set — the alert glyph is one, and comparing the two drawings settled it,
             which comparing their names never would: both sides already used the same word. A disk
             beside a size also read as a save affordance, and nothing on this screen saves. -->
        <span
          class="ml-1 flex items-center gap-0.5 font-mono text-label"
          [class.text-hot-ink]="tone === 'over'"
          [class.text-orange-ink]="tone === 'near'"
        >
          <nc-icon name="alert" [size]="12" />
          {{ kb(size().total) }}
        </span>
      }
      <ng-template #panel>
        <nc-popover-panel title="Versions" [header]="false" class="w-[354px]">
          <!-- Its own head row: the sheet gives this one a raised band where every other popover in
               the app has a plain rule, and it is the only one the sheet draws open. -->
          <header
            class="flex h-[38px] items-center justify-between border-b border-line bg-raised px-2"
          >
            <span class="label text-ink-3">Versions</span>
          </header>
          <!-- The list is the one part that grows without bound — a project saves as often as its
               author presses the key — so it is what is allowed to scroll, and the head, the totals
               and the budget below stay where they were put. The ceiling is the window's, because a
               fixed one is either short on a large screen or too tall on a small one. -->
          <div>
            <!-- Edge to edge: the current row carries a ground of its own, and inset from the panel
                 it read as a card inside a card. No rules between the rows either — the sheet
                 separates them by that ground, and a list that also ruled every gap read as a
                 table. -->
            <ul class="max-h-[min(52vh,420px)] overflow-y-auto">
              <!-- One list, newest first: releases and autosaves interleaved, as the design shows. -->
              @for (v of history(); track v.key; let i = $index) {
                <li class="flex h-[52px] items-center gap-1 px-2" [class.bg-line-soft]="i === 0">
                  <!-- Gold marks which one the game is, not which ones were released. -->
                  <span
                    class="w-[22px] shrink-0 font-mono text-label"
                    [class]="i === 0 ? 'text-gold-ink' : v.release ? 'text-ink-body' : 'text-ink-4'"
                  >
                    {{ v.release ? 'v' + v.index : '—' }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-ui" [class]="i === 0 ? 'text-ink' : 'text-ink-3'">
                      {{ v.release ? v.name : 'Autosave' }}
                    </div>
                    @if (v.when) {
                      <div class="label text-ink-4">{{ v.when | ncRelativeTime }}</div>
                    }
                  </div>
                  <!-- "Current" is only true while nothing has been typed since: the newest save
                       stops describing the document the moment anyone edits it. -->
                  @if (i === 0 && !session.dirty()) {
                    <span class="label shrink-0 text-gold-ink">Current</span>
                  } @else {
                    <button
                      ncButton
                      variant="ghost"
                      size="sm"
                      iconOnly
                      [attr.aria-label]="
                        v.release ? 'Restore this release' : 'Restore this autosave'
                      "
                      [disabled]="!session.isCollaborator() || restoring()"
                      (click)="restore(v)"
                    >
                      <nc-icon name="undo" [size]="12" />
                    </button>
                  }
                  <!-- The row the game currently is offers nothing to do to it: the sheet gives it
                       its badge and no actions, and restoring or deleting what you are already on
                       are both the same nothing. -->
                  @if (i !== 0 || session.dirty()) {
                    <button
                      ncButton
                      variant="ghost"
                      size="sm"
                      iconOnly
                      [attr.aria-label]="v.release ? 'Delete this release' : 'Delete this autosave'"
                      [disabled]="!session.isCollaborator()"
                      (click)="remove(v)"
                    >
                      <nc-icon name="trash" [size]="12" />
                    </button>
                  }
                </li>
              } @empty {
                <li class="px-2 py-2 text-meta text-ink-3">Nothing saved yet.</li>
              }
            </ul>
            <div class="label mt-1 px-2">
              {{ releases().length }} named · {{ autosaves().length }} autosaves
            </div>
            <div class="pb-2">
              <form class="mt-2 flex items-stretch gap-1 px-2" (ngSubmit)="checkpoint()">
                <input
                  ncInput
                  name="cp"
                  [ngModel]="cpName()"
                  (ngModelChange)="cpName.set($event)"
                  placeholder="Name this version"
                />
                <!-- A name already in the list rewrites that version, which the cap does not count. -->
                <button
                  ncButton
                  variant="secondary"
                  size="md"
                  type="submit"
                  class="h-auto shrink-0"
                  [disabled]="
                    !cpName().trim() ||
                    !session.isCollaborator() ||
                    saving() ||
                    (atCap() && !overwriting())
                  "
                >
                  Save
                </button>
              </form>
              @if (atCap()) {
                <p class="label mt-1 px-2 text-ink-3">
                  {{
                    t('editor.game.versionLimit', { count: releases().length, max: maxVersions() })
                  }}
                </p>
              }
            </div>
          </div>
          <div class="border-t border-line p-2">
            <div class="mb-1 flex justify-between text-label">
              <span>Game size</span>
              <span class="font-mono text-ink">{{ kb(size().total) }} / 1 MB</span>
            </div>
            <nc-meter size="md" [segments]="segments()" [max]="ceiling" label="Game size" />
            @if (size().total > ceiling) {
              <p class="mt-1 text-meta text-hot-ink">
                Over by {{ kb(size().total - ceiling) }}, so publishing is blocked. Everything else
                still saves, and the game still runs.
              </p>
            }
          </div>
        </nc-popover-panel>
      </ng-template>
    </ng-container>
  `,
  host: { class: 'inline-flex items-center' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VersionsPopoverComponent {
  protected readonly session = inject(WorkSessionService);
  private readonly qc = inject(QueryClient);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  protected readonly open = signal(false);
  protected readonly ceiling = PUBLISH_CEILING;
  protected readonly cpName = signal('');
  private readonly tick = signal(0);

  // Neither is gated on `open`: the chip names the newest version before anyone clicks it, and a
  // key that came and went with the panel refetched both lists on every opening.
  private readonly versions = injectProjectVersions(() => this.session.id);
  private readonly checkpoints = injectProjectCheckpoints(() => this.session.id);
  private readonly limits = injectProjectLimits();
  protected readonly releases = computed(() => this.checkpoints.data() ?? []);
  protected readonly autosaves = computed(() => this.versions.data() ?? []);
  protected readonly restoring = signal(false);
  protected readonly saving = signal(false);
  /** Named versions a project may hold, once the server has said; it has the last word anyway. */
  protected readonly maxVersions = computed(() => this.limits.data()?.maxCheckpoints);
  protected readonly atCap = computed(() => {
    const max = this.maxVersions();
    return max !== undefined && this.releases().length >= max;
  });
  /** Saving under a name the list already holds rewrites that version rather than adding one. */
  protected readonly overwriting = computed(() => {
    const name = this.cpName().trim();
    return this.releases().some((r) => r.name === name);
  });

  /** Releases and autosaves in one list, newest first, releases numbered v1, v2, … */
  protected readonly history = computed<HistoryRow[]>(() => {
    const releases = [...this.releases()].sort(byWhen);
    const numbered = releases.map((r, i) => ({ ...r, index: releases.length - i }));
    return [...numbered, ...this.autosaves().map((a) => ({ ...a, index: 0 }))].sort(byWhen);
  });
  /** The newest named version — what the chip calls the game; nothing, while none has a name. */
  protected readonly newest = computed(() => this.history().find((v) => v.release));
  protected readonly size = computed(() => {
    this.tick();
    return computeSizeReport(this.session.game);
  });
  /** `over` past the ceiling, `near` from 90 %, nothing at all below that. */
  protected readonly sizeTone = computed<'over' | 'near' | null>(() => {
    const total = this.size().total;
    if (total > this.ceiling) return 'over';
    return total >= this.ceiling * 0.9 ? 'near' : null;
  });

  protected readonly segments = computed(() => {
    const s = this.size();
    return [
      { label: `Sprites ${this.kb(s.sprites)}`, value: s.sprites, color: 'bg-sky' },
      { label: `Music ${this.kb(s.sound)}`, value: s.sound, color: 'bg-blush' },
      { label: `Map ${this.kb(s.map)}`, value: s.map, color: 'bg-jade' },
      { label: `Code ${this.kb(s.code)}`, value: s.code, color: 'bg-gold' },
    ];
  });

  constructor() {
    let timer: ReturnType<typeof setTimeout> | null = null;
    this.session.doc.on('update', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        this.tick.update((v) => v + 1);
      }, 1000);
    });
  }

  protected kb(n: number): string {
    return n >= 1024 * 1024
      ? `${(n / 1024 / 1024).toFixed(2)} MB`
      : `${String(Math.round(n / 1024))} KB`;
  }

  /**
   * Name the current state as a version.
   *
   * The endpoint takes the document as a file, exactly like an autosave — this sent an empty body
   * and got a 422 back every single time. Nothing surfaced it, so the toast said the version was
   * saved and the list it refreshed stayed empty.
   */
  protected async checkpoint(): Promise<void> {
    const name = this.cpName().trim();
    if (!name || this.saving()) return;
    this.saving.set(true);
    try {
      // Only where something has been written since: naming the state you are already saved at is
      // exactly what somebody marking a milestone is doing, and refusing it there sent them off to
      // make a pointless edit first.
      if (this.session.dirty()) await this.session.save({ force: true });
      unwrap(
        await projectControllerSaveCheckpoint({
          path: { id: String(this.session.id), name },
          body: {
            file: new Blob([Y.encodeStateAsUpdate(this.session.doc) as BlobPart], {
              type: 'application/octet-stream',
            }),
          },
        }),
      );
      this.cpName.set('');
      await invalidateProjectHistory(this.qc, this.session.id, 'checkpoints');
      this.toasts.show(this.transloco.translate('editor.game.versionSaved', { name }), 'success');
    } catch (e) {
      // The server's count, not the list's: the list may be behind the save that filled it.
      const limit =
        e instanceof ApiError && e.code === 'CHECKPOINT_LIMIT'
          ? (e.body as CheckpointLimitDto)
          : null;
      this.toasts.show(
        limit
          ? this.transloco.translate('editor.game.versionLimit', {
              count: limit.count,
              max: limit.max,
            })
          : this.transloco.translate('editor.game.versionSaveFailed'),
        'error',
      );
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Put a saved version back into the live document.
   *
   * The restored state enters the shared document like any edit, so it reaches every peer at once
   * and the host's autosave like any edit — nothing here has to write it out. `Game.restoreFrom`
   * does the work: this used to call `Y.applyUpdate`, which cannot undo anything — the blob is
   * this same document's own history, so re-applying it is by definition a no-op.
   */
  protected async restore(row: HistoryRow): Promise<void> {
    if (!this.session.isCollaborator() || this.restoring()) return;
    this.restoring.set(true);
    try {
      const path = { id: String(this.session.id) };
      const res = row.release
        ? await projectControllerGetCheckpoint({
            path: { ...path, checkpoint: row.name },
            parseAs: 'blob',
          })
        : await projectControllerGetVersion({
            path: { ...path, version: row.name },
            parseAs: 'blob',
          });
      const blob = res.data;
      if (!blob || blob.size === 0) throw new Error('empty version');
      this.session.game.restoreFrom(new Uint8Array(await blob.arrayBuffer()));
      this.toasts.show(
        this.transloco.translate('editor.game.restored', { name: row.name }),
        'success',
      );
      this.open.set(false);
    } catch {
      this.toasts.show(this.transloco.translate('editor.game.restoreFailed'), 'error');
    } finally {
      this.restoring.set(false);
    }
  }

  /**
   * Drop a saved version, each kind by its own route.
   *
   * An autosave is the one worth being able to drop: there are many of them and none was asked
   * for. A release goes too, since a name given by mistake is still a mistake.
   */
  protected async remove(row: HistoryRow): Promise<void> {
    if (!this.session.isCollaborator()) return;
    const path = { id: String(this.session.id) };
    const res = row.release
      ? await projectControllerDeleteCheckpoint({ path: { ...path, name: row.name } })
      : await projectControllerDeleteVersion({ path: { ...path, version: row.name } });
    if (res.error) {
      this.toasts.show(this.transloco.translate('editor.game.versionDeleteFailed'), 'error');
      return;
    }
    await invalidateProjectHistory(
      this.qc,
      this.session.id,
      row.release ? 'checkpoints' : 'versions',
    );
  }
}
