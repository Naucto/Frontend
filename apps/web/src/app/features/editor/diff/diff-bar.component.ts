import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  MarkComponent,
  PopoverDirective,
  PopoverPanelComponent,
  RelativeTimePipe,
  ToggleComponent,
} from '@naucto/ui';

import type { HistoryRow } from '../game/versions-popover.component';
import { DiffStore, type SnapshotRef } from './diff.store';

interface PickerRow {
  ref: SnapshotRef;
  title: string;
  when?: string;
  /** A catalogue key standing where a saved version has a date. */
  hint?: string;
}

/**
 * The left half of the diff controls in the editor's top bar: the two sides compared, which take
 * the place of the versions chip while the mode is on, and the switch.
 */
@Component({
  selector: 'nc-diff-bar',
  imports: [
    NgTemplateOutlet,
    TranslocoDirective,
    MarkComponent,
    PopoverDirective,
    PopoverPanelComponent,
    RelativeTimePipe,
    ToggleComponent,
  ],
  templateUrl: './diff-bar.component.html',
  host: { class: 'flex items-center gap-1.5' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiffBarComponent {
  protected readonly diff = inject(DiffStore);
  private readonly transloco = inject(TranslocoService);
  protected readonly fromOpen = signal(false);
  protected readonly toOpen = signal(false);

  private readonly versionRows = computed<PickerRow[]>(() =>
    this.diff.history().map((row: HistoryRow) => ({
      ref: row.key,
      title: row.release
        ? `v${String(row.index)} ${row.name}`
        : this.transloco.translate('editor.game.autosave'),
      when: row.when,
    })),
  );
  private readonly currentRow = computed<PickerRow>(() => ({
    ref: 'current',
    title: this.transloco.translate('editor.diff.current'),
    hint: 'editor.diff.currentHint',
  }));
  protected readonly fromRows = computed(() => [this.currentRow(), ...this.versionRows()]);
  /**
   * The design offers the assistant's pending changes here. Until the backend serves its working
   * save to the editor, a saved version stands in that place: taken from it change by change, it
   * is a restore of only what one wants back.
   */
  protected readonly toRows = computed(() => [this.currentRow(), ...this.versionRows()]);

  protected titleOf(ref: SnapshotRef): string {
    return this.fromRows().find((row) => row.ref === ref)?.title ?? ref;
  }

  protected pick(side: 'from' | 'to', ref: SnapshotRef): void {
    this.diff.choose(side, ref);
    this.fromOpen.set(false);
    this.toOpen.set(false);
  }
}
