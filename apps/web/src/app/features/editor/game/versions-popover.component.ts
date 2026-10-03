import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  projectContentControllerDeleteCheckpoint,
  projectContentControllerDeleteVersion,
  projectContentControllerGetCheckpoint,
  projectContentControllerGetVersion,
} from '@naucto/api-client';
import { computeSizeReport, isFromFutureSchema, migrateGame } from '@naucto/engine';
import {
  ButtonDirective,
  DialogService,
  formatBytes,
  IconComponent,
  MeterComponent,
  PopoverDirective,
  PopoverPanelComponent,
  RelativeTimePipe,
  ToastService,
} from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';
import * as Y from 'yjs';

import {
  injectProjectCheckpoints,
  injectProjectVersions,
  invalidateProjectHistory,
  type VersionRow,
} from '../../../shared/queries/projects.queries';
import { SessionSaveService } from '../work-session/session-save.service';
import { WorkSessionService } from '../work-session/work-session.service';
import { PUBLISH_CEILING, sizeSegments } from './publish.dialog';
import { SaveVersionDialog, type SaveVersionDialogData } from './save-version.dialog';

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
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    MeterComponent,
    PopoverDirective,
    PopoverPanelComponent,
    RelativeTimePipe,
  ],
  templateUrl: './versions-popover.component.html',
  host: { class: 'inline-flex items-center' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VersionsPopoverComponent {
  protected readonly session = inject(WorkSessionService);
  protected readonly saves = inject(SessionSaveService);
  private readonly qc = inject(QueryClient);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly dialogs = inject(DialogService);
  protected readonly open = signal(false);
  protected readonly ceiling = PUBLISH_CEILING;
  private readonly tick = signal(0);

  // Not gated on `open`: the chip names the newest version before the panel is ever opened.
  private readonly versions = injectProjectVersions(() => this.session.id);
  private readonly checkpoints = injectProjectCheckpoints(() => this.session.id);
  protected readonly releases = computed(() => this.checkpoints.data() ?? []);
  protected readonly autosaves = computed(() => this.versions.data() ?? []);
  protected readonly restoring = signal(false);

  /** Releases and autosaves in one list, newest first, releases numbered v1, v2, … */
  protected readonly history = computed<HistoryRow[]>(() => {
    const releases = [...this.releases()].sort(byWhen);
    const numbered = releases.map((release, i) => ({ ...release, index: releases.length - i }));
    return [...numbered, ...this.autosaves().map((autosave) => ({ ...autosave, index: 0 }))].sort(
      byWhen,
    );
  });
  /** The newest named version — what the chip calls the game; nothing, while none has a name. */
  protected readonly newest = computed(() => this.history().find((row) => row.release));
  protected readonly size = computed(() => {
    this.tick();
    return computeSizeReport(this.session.game);
  });
  protected readonly sizeTone = computed<'over' | 'near' | null>(() => {
    const total = this.size().total;
    if (total > this.ceiling) {
      return 'over';
    }
    return total >= this.ceiling * 0.9 ? 'near' : null;
  });

  protected readonly segments = computed(() => sizeSegments(this.size()));
  protected readonly kb = formatBytes;

  constructor() {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onUpdate = (): void => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        this.tick.update((count) => count + 1);
      }, 1000);
    };
    this.session.doc.on('update', onUpdate);
    inject(DestroyRef).onDestroy(() => {
      this.session.doc.off('update', onUpdate);
      if (timer) {
        clearTimeout(timer);
      }
    });
  }

  /** The panel stays open under the dialog, so the new name is in the list when it closes. */
  protected openSave(): void {
    this.dialogs.open<SaveVersionDialog, SaveVersionDialogData, boolean>(SaveVersionDialog, {
      data: { projectId: this.session.id, saves: this.saves },
      width: '420px',
      ariaLabel: this.transloco.translate('editor.game.saveVersion'),
    });
  }

  /**
   * Puts a saved version back into the live document as an edit, so it reaches every peer and the
   * host's autosave like any other. Applying the blob as a Yjs update instead would be a no-op: it
   * is this document's own history.
   */
  protected async restore(row: HistoryRow): Promise<void> {
    if (!this.session.isCollaborator() || this.restoring()) {
      return;
    }
    this.restoring.set(true);
    try {
      const path = { id: String(this.session.id) };
      const res = row.release
        ? await projectContentControllerGetCheckpoint({
            path: { ...path, name: row.name },
            parseAs: 'blob',
          })
        : await projectContentControllerGetVersion({
            path: { ...path, version: row.name },
            parseAs: 'blob',
          });
      const blob = res.data;
      if (!blob || blob.size === 0) {
        throw new Error('empty version');
      }
      // A version saved under an older schema is brought forward first: the restore copies only
      // the current schema's shape and would drop whatever sits in the old one.
      const scratch = new Y.Doc();
      try {
        Y.applyUpdate(scratch, new Uint8Array(await blob.arrayBuffer()));
        if (isFromFutureSchema(scratch)) {
          throw new Error('version from a newer schema');
        }
        migrateGame(scratch);
        this.session.game.restoreFrom(Y.encodeStateAsUpdate(scratch));
      } finally {
        scratch.destroy();
      }
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

  protected async remove(row: HistoryRow): Promise<void> {
    if (!this.session.isCollaborator()) {
      return;
    }
    const path = { id: String(this.session.id) };
    const res = row.release
      ? await projectContentControllerDeleteCheckpoint({ path: { ...path, name: row.name } })
      : await projectContentControllerDeleteVersion({ path: { ...path, version: row.name } });
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
