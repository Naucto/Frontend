import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { unwrap } from '@app/core/api/api-errors';
import {
  projectControllerPublish,
  projectControllerUnpublish,
  projectControllerUpdateRelease,
} from '@naucto/api-client';
import { computeSizeReport } from '@naucto/engine';
import { ButtonDirective, DialogShellComponent, MeterComponent } from '@naucto/ui';

import type { WorkSessionService } from '../work-session/work-session.service';

export const PUBLISH_CEILING = 1024 * 1024;

/** PUBLISH: save, then publish / update the release / unpublish, with the size budget in view. */
@Component({
  selector: 'nc-publish-dialog',
  imports: [ButtonDirective, DialogShellComponent, MeterComponent],
  template: `
    <nc-dialog-shell title="Publish">
      <p class="text-body text-ink-2">
        Publishing puts the current save on the hub. People can play it, like it and remix it.
      </p>
      <div class="mt-2">
        <div class="mb-1 flex justify-between text-label">
          <span>Game size</span>
          <span class="font-mono text-ink">{{ kb(size().total) }} / 1 MB</span>
        </div>
        <nc-meter size="md" [segments]="segments()" [max]="ceiling" label="Game size" />
      </div>
      @if (size().total > ceiling) {
        <p class="mt-2 text-meta text-hot-ink">
          Over by {{ kb(size().total - ceiling) }}, so publishing is blocked. Everything else still
          saves, and the game still runs.
        </p>
      }
      @if (error()) {
        <p class="mt-2 text-meta text-hot-ink">{{ error() }}</p>
      }
      <ng-container footer>
        @if (data.session.project()?.publishedAt) {
          <button ncButton variant="danger" (click)="unpublish()" [disabled]="busy()">
            Unpublish
          </button>
          <button
            ncButton
            variant="primary"
            (click)="publish(true)"
            [disabled]="busy() || size().total > ceiling"
          >
            Update release
          </button>
        } @else {
          <button ncButton variant="ghost" (click)="ref.close(false)">Not yet</button>
          <button
            ncButton
            variant="primary"
            (click)="publish(false)"
            [disabled]="busy() || size().total > ceiling"
          >
            Publish
          </button>
        }
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublishDialogComponent {
  protected readonly data = inject<{ session: WorkSessionService }>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly ceiling = PUBLISH_CEILING;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly size = computed(() => computeSizeReport(this.data.session.game));
  protected readonly segments = computed(() => {
    const s = this.size();
    return [
      { label: `Sprites ${this.kb(s.sprites)}`, value: s.sprites, color: 'bg-sky' },
      { label: `Music ${this.kb(s.sound)}`, value: s.sound, color: 'bg-blush' },
      { label: `Map ${this.kb(s.map)}`, value: s.map, color: 'bg-jade' },
      { label: `Code ${this.kb(s.code)}`, value: s.code, color: 'bg-gold' },
    ];
  });

  protected kb(n: number): string {
    return n >= 1024 * 1024
      ? `${(n / 1024 / 1024).toFixed(2)} MB`
      : `${String(Math.round(n / 1024))} KB`;
  }

  protected async publish(update: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.session.save();
      const id = String(this.data.session.id);
      unwrap(
        update
          ? await projectControllerUpdateRelease({ path: { id } })
          : await projectControllerPublish({ path: { id } }),
      );
      await this.data.session.refreshProject();
      this.ref.close(true);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Publishing failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async unpublish(): Promise<void> {
    this.busy.set(true);
    try {
      unwrap(await projectControllerUnpublish({ path: { id: String(this.data.session.id) } }));
      await this.data.session.refreshProject();
      this.ref.close(false);
    } finally {
      this.busy.set(false);
    }
  }
}
