import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import {
  projectControllerDeleteCheckpoint,
  projectControllerGetCheckpoint,
  projectControllerGetCheckpoints,
  projectControllerGetVersion,
  projectControllerGetVersions,
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
import { injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import * as Y from 'yjs';

import { WorkSessionService } from '../work-session/work-session.service';
import { PUBLISH_CEILING } from './publish.dialog';

interface HistoryRow extends VersionRow {
  /** v1, v2 … for releases; 0 for autosaves. */
  index: number;
}

/** Newest first; entries with no date sort last. */
const byWhen = (a: VersionRow, b: VersionRow): number => (b.when ?? '').localeCompare(a.when ?? '');

interface VersionRow {
  name: string;
  when?: string;
  /** True for a named release, false for an autosave. */
  release: boolean;
}

/**
 * Both endpoints answer with the list wrapped in an object (`{ versions }` / `{ checkpoints }`),
 * and both are typed `unknown` in the generated client — which is how an always-empty popover
 * shipped. Accept either shape and read the backend's own `date` field.
 */
const toRows = (raw: unknown, key: 'versions' | 'checkpoints', release: boolean): VersionRow[] => {
  const list = Array.isArray(raw) ? raw : ((raw as Record<string, unknown> | null)?.[key] ?? []);
  if (!Array.isArray(list)) return [];
  return list.map((v: unknown) => {
    if (typeof v === 'string') return { name: v, release };
    const o = v as {
      name?: string;
      key?: string;
      version?: string;
      date?: string;
      createdAt?: string;
      lastModified?: string;
    };
    return {
      name: o.name ?? o.key ?? o.version ?? '?',
      when: o.date ?? o.createdAt ?? o.lastModified,
      release,
    };
  });
};

/** Header chip "Platformer v3 · 942 KB" → versions, autosaves and the size budget. */
@Component({
  selector: 'nc-versions-popover',
  imports: [
    FormsModule,
    ButtonDirective,
    IconComponent,
    InputDirective,
    MeterComponent,
    PopoverDirective,
    PopoverPanelComponent,
    RelativeTimePipe,
  ],
  template: `
    <button
      type="button"
      [ncPopover]="panel"
      [(popoverOpen)]="open"
      class="-ms-[11px] flex items-center gap-1.25 rounded-sm border bg-raised px-1.5 py-0.75 text-ui tracking-[0.04em] text-ink"
      [class]="open() ? 'border-gold' : 'border-line hover:border-line-strong'"
    >
      <span class="max-w-[24ch] truncate">{{ session.project()?.name || 'Untitled game' }}</span>
      <!-- The chip counted named versions only, so it read "v0" on every project that had never
           had one — which is all of them, since naming one was a 422. -->
      <span class="font-mono text-meta tracking-tag text-ink-3">v{{ history().length }}</span>
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
          <span class="label text-ink-4">name one to release it</span>
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
            @for (v of history(); track v.name; let i = $index) {
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
                    [attr.aria-label]="v.release ? 'Restore this release' : 'Restore this autosave'"
                    [disabled]="!session.isHost() || restoring()"
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
                    [disabled]="!v.release || !session.isHost()"
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
            {{ releases().length }} releases · {{ autosaves().length }} autosaves
          </div>
          <form class="mt-2 flex items-stretch gap-1 px-2 pb-2" (ngSubmit)="checkpoint()">
            <input ncInput name="cp" [(ngModel)]="cpName" placeholder="Name this version" />
            <button
              ncButton
              variant="secondary"
              size="md"
              type="submit"
              class="h-auto shrink-0"
              [disabled]="!cpName.trim() || !session.isHost() || saving()"
            >
              Save
            </button>
          </form>
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
  protected cpName = '';
  private readonly tick = signal(0);

  // Not gated on `open` either: the chip counts every saved version, and gating meant the count
  // changed the moment the panel closed and its query key went with it.
  private readonly versions = injectQuery(() => ({
    queryKey: ['project', this.session.id, 'versions'],
    queryFn: async () =>
      toRows(
        (await projectControllerGetVersions({ path: { id: String(this.session.id) } })).data,
        'versions',
        false,
      ),
  }));
  private readonly checkpoints = injectQuery(() => ({
    // Not gated on `open`: the header chip shows "v3" before anyone clicks it.
    queryKey: ['project', this.session.id, 'checkpoints'],
    queryFn: async () =>
      toRows(
        (await projectControllerGetCheckpoints({ path: { id: String(this.session.id) } })).data,
        'checkpoints',
        true,
      ),
  }));
  protected readonly releases = computed(() => this.checkpoints.data() ?? []);
  protected readonly autosaves = computed(() => this.versions.data() ?? []);
  protected readonly restoring = signal(false);
  protected readonly saving = signal(false);

  /** Releases and autosaves in one list, newest first, releases numbered v1, v2, … */
  protected readonly history = computed<HistoryRow[]>(() => {
    const releases = [...this.releases()].sort(byWhen);
    const numbered = releases.map((r, i) => ({ ...r, index: releases.length - i }));
    return [...numbered, ...this.autosaves().map((a) => ({ ...a, index: 0 }))].sort(byWhen);
  });
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
    const name = this.cpName.trim();
    if (!name || this.saving()) return;
    this.saving.set(true);
    try {
      // Only where something has been written since: naming the state you are already saved at is
      // exactly what somebody marking a milestone is doing, and refusing it there sent them off to
      // make a pointless edit first.
      if (this.session.dirty()) await this.session.save();
      const res = await projectControllerSaveCheckpoint({
        path: { id: String(this.session.id), name },
        body: {
          file: new Blob([Y.encodeStateAsUpdate(this.session.doc) as BlobPart], {
            type: 'application/octet-stream',
          }),
        },
      });
      if (res.error) throw new Error('saveCheckpoint failed');
      this.cpName = '';
      await this.qc.invalidateQueries({ queryKey: ['project', this.session.id, 'checkpoints'] });
      this.toasts.show(this.transloco.translate('editor.game.versionSaved', { name }), 'success');
    } catch {
      this.toasts.show(this.transloco.translate('editor.game.versionSaveFailed'), 'error');
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Put a saved version back into the live document.
   *
   * Host only, because the host is the one that writes the blob back. `Game.restoreFrom` does the
   * work: this used to call `Y.applyUpdate`, which cannot undo anything — the blob is this same
   * document's own history, so re-applying it is by definition a no-op.
   */
  protected async restore(row: HistoryRow): Promise<void> {
    if (!this.session.isHost() || this.restoring()) return;
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
   * Only named versions delete from here. Autosaves have a backend route of their own now, but the
   * generated client predates it — TODO(NCTO-23): wire it once `@naucto/api-client` is rebuilt.
   */
  protected async remove(row: HistoryRow): Promise<void> {
    const res = await projectControllerDeleteCheckpoint({
      path: { id: String(this.session.id), name: row.name },
    });
    if (res.error) {
      this.toasts.show(this.transloco.translate('editor.game.versionDeleteFailed'), 'error');
      return;
    }
    await this.qc.invalidateQueries({ queryKey: ['project', this.session.id, 'checkpoints'] });
  }
}
