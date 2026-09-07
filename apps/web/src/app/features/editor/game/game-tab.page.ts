import { SlicePipe } from '@angular/common';
import type { OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { RuntimeHostService } from '@app/shared/game-screen/runtime-host.service';
import { qk } from '@app/shared/queries/query-keys';
import { injectProjectImage, injectRelease } from '@app/shared/queries/releases.queries';
import { yTextField } from '@app/shared/yjs/y-signal';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  projectControllerRemove,
  projectControllerUpdate,
  projectControllerUploadProjectImage,
} from '@naucto/api-client';
import {
  AvatarComponent,
  ButtonDirective,
  ConfirmDialogComponent,
  DialogService,
  FieldComponent,
  HelpDotComponent,
  IconComponent,
  InputDirective,
  LabelComponent,
  NoticeComponent,
  PanelColumnComponent,
  ReadoutComponent,
  SearchComponent,
  SectionComponent,
  SegmentedComponent,
  TagInputComponent,
  ToastService,
} from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';
import * as Y from 'yjs';

import { PANEL_WIDTH } from '../state/editor-ui.store';
import { WorkSessionService } from '../work-session/work-session.service';

const NAME_MAX = 60;
const SUMMARY_MAX = 80;

/** GAME tab: what this thing is, who it's for, where it goes. */
@Component({
  selector: 'nc-game-tab-page',
  imports: [
    SlicePipe,
    FormsModule,
    TranslocoDirective,
    AvatarComponent,
    ButtonDirective,
    FieldComponent,
    HelpDotComponent,
    IconComponent,
    InputDirective,
    LabelComponent,
    NoticeComponent,
    PanelColumnComponent,
    ReadoutComponent,
    SearchComponent,
    SectionComponent,
    SegmentedComponent,
    TagInputComponent,
  ],
  template: `
    <div *transloco="let t" class="grid h-full grid-cols-[minmax(0,1fr)_auto]">
      <section class="flex min-h-0 flex-col">
        <div
          class="flex h-5 min-w-0 shrink-0 items-center gap-1.5 border-b border-line bg-panel pr-1.5 pl-2"
        >
          <span class="font-mono text-meta tracking-strip text-ink uppercase">
            {{ t('editor.game.title') }}
          </span>
          <span class="label truncate text-ink-4">
            {{
              session.lastSavedAt()
                ? t('editor.game.lastSaved', { when: ago(session.lastSavedAt()) })
                : t('editor.game.notSaved')
            }}
          </span>
        </div>
        <div class="min-h-0 flex-1 overflow-auto bg-inset px-2.75 py-2.5">
          <div class="grid grid-cols-[320px_minmax(0,1fr)] gap-2.75">
            <div>
              <nc-label class="mb-1">{{ t('editor.game.icon') }}</nc-label>
              <div
                class="relative aspect-video overflow-hidden rounded-sm border border-line-strong bg-inset"
              >
                @if (cover.data(); as url) {
                  <img [src]="url" alt="" class="pixelated h-full w-full object-cover" />
                } @else {
                  <div class="flex h-full flex-col items-center justify-center text-ink-4">
                    <nc-icon name="image" [size]="24" />
                    <span class="label">{{ t('editor.game.noCover') }}</span>
                  </div>
                }
                <span
                  class="absolute top-1 right-1 rounded-xs border border-line-strong bg-page/80 px-[6px] py-[3px] font-mono text-micro tracking-tag text-ink"
                >
                  320×180
                </span>
                <!-- The actions sit on the cover, not under it. That is what lets the column be
                     exactly as wide as the frame, which is how the design sizes this whole row. -->
                <div
                  class="absolute inset-x-0 bottom-0 flex h-4 border-t border-line-strong bg-page/85"
                >
                  <button
                    type="button"
                    class="flex flex-1 cursor-pointer items-center justify-center gap-0.75 border-r border-line-strong font-ui text-label text-ink uppercase transition-colors duration-100 hover:text-gold-ink"
                    (click)="grabFrame()"
                  >
                    <nc-icon name="camera" [size]="12" />
                    {{ t('editor.game.grabFrame') }}
                  </button>
                  <label
                    class="flex flex-1 cursor-pointer items-center justify-center gap-0.75 font-ui text-label text-ink-body uppercase transition-colors duration-100 hover:text-gold-ink"
                  >
                    <nc-icon name="upload" [size]="12" />
                    {{ t('editor.game.upload') }}
                    <input type="file" accept="image/*" class="hidden" (change)="upload($event)" />
                  </label>
                </div>
              </div>
              <p class="mt-1 text-label text-ink-4">{{ t('editor.game.coverHint') }}</p>
            </div>
            <div class="grid content-start gap-2">
              <nc-field
                [label]="t('editor.game.name')"
                for="g-name"
                [counter]="name().length + ' / ' + nameMax"
              >
                <input
                  ncInput
                  id="g-name"
                  [ngModel]="name()"
                  (ngModelChange)="name.set($event)"
                  [maxlength]="nameMax"
                  [placeholder]="t('editor.game.namePlaceholder')"
                />
              </nc-field>
              <nc-field
                [label]="t('editor.game.summary')"
                for="g-summary"
                [counter]="summary().length + ' / ' + summaryMax"
              >
                <nc-help-dot actions [text]="t('editor.game.summaryHelp')" />
                <input
                  ncInput
                  id="g-summary"
                  [ngModel]="summary()"
                  (ngModelChange)="summary.set($event)"
                  [maxlength]="summaryMax"
                  [placeholder]="t('editor.game.summaryPlaceholder')"
                />
              </nc-field>
              <nc-field [label]="t('editor.game.description')" for="g-desc">
                <textarea
                  ncInput
                  id="g-desc"
                  rows="4"
                  [ngModel]="description()"
                  (ngModelChange)="description.set($event)"
                  [placeholder]="t('editor.game.descriptionPlaceholder')"
                ></textarea>
              </nc-field>
              <nc-field
                [label]="t('editor.game.tags')"
                for="g-tags"
                [counter]="tags().length + ' / 10'"
              >
                <nc-tag-input
                  [tags]="tags()"
                  (tagsChange)="setTags($event)"
                  [placeholder]="t('editor.game.tagPlaceholder')"
                />
              </nc-field>
            </div>
          </div>
        </div>
      </section>

      <nc-panel-column [width]="PANEL_WIDTH" [title]="t('editor.game.publishing')">
        <button actions ncButton variant="secondary" size="sm" (click)="exportGame()">
          <nc-icon name="download" [size]="12" />
          {{ t('editor.game.export') }}
        </button>
        <button actions ncButton variant="secondary" size="sm" (click)="confirmDelete()">
          <nc-icon name="trash" [size]="12" />
          {{ t('editor.game.delete') }}
        </button>
        @if (!canPublish()) {
          <nc-notice variant="band">{{ t('editor.game.publishBlocked') }}</nc-notice>
        }
        <div class="grid min-w-0">
          <nc-section banded [title]="t('editor.game.status')">
            <nc-help-dot actions [text]="t('editor.game.statusHelp')" />
            <nc-segmented
              [options]="statuses"
              [value]="status()"
              (valueChange)="setStatus($event)"
              label="Status"
            />
            <div class="mt-1 flex justify-between font-mono text-micro tracking-wide uppercase">
              <!-- Dim key, bright value, like every other pair in the column: at one weight the
                   row said nothing about which half was the answer. -->
              <span class="text-ink-3">{{ t('editor.game.published') }}</span>
              <span class="text-ink">
                {{
                  session.project()?.publishedAt
                    ? (session.project()?.publishedAt | slice: 0 : 10)
                    : t('editor.game.never')
                }}
              </span>
            </div>
          </nc-section>
          <nc-section banded [title]="t('editor.game.monetization')">
            <nc-help-dot actions [text]="t('editor.game.monetizationHelp')" />
            <!-- Full width, and neutral where STATUS carries a meaning colour: two filled cells
                 stacked make the neutral choice read as a second state colour. The width and the
                 tone are separate settings and only the tone was at issue. -->
            <nc-segmented
              fill
              [options]="monetizations"
              [value]="monetization()"
              (valueChange)="setMonetization($event)"
              label="Monetization"
            />
            <!-- Label and control on one line, like every other key and value in this column.
                 Stacked, a field with one short number under a one-word label spent two rows on
                 what the rows around it say in one. -->
            <div
              class="mt-1 flex items-center justify-between gap-1.75"
              [class.opacity-40]="monetization() !== 'PAID'"
            >
              <label class="label text-ink-3" for="g-price">{{ t('editor.game.price') }}</label>
              @if (monetization() === 'PAID') {
                <input
                  ncInput
                  id="g-price"
                  class="w-[96px]"
                  type="number"
                  min="0"
                  step="0.5"
                  [ngModel]="price()"
                  (ngModelChange)="setPrice($event)"
                />
              } @else {
                <nc-readout size="sm" value="–" class="w-[64px]" />
              }
            </div>
          </nc-section>
          <nc-section banded [title]="t('editor.game.inSession')">
            <span actions class="label text-ink-4">{{ session.collaborators().length }}</span>
            @for (c of session.collaborators(); track c.clientId) {
              <div class="flex items-center gap-1 py-0.5">
                <nc-avatar [name]="c.name" [colour]="c.isSelf ? 'gold' : c.colour" [size]="24" />
                <span class="text-ui text-ink">{{ c.name }}</span>
                @if (c.isSelf) {
                  <span class="label text-ink-4">{{ t('editor.game.you') }}</span>
                }
                <span class="flex-1"></span>
                @if (!c.isSelf && session.isHost()) {
                  <button ncButton variant="ghost" size="sm" (click)="session.kick(c.userId)">
                    {{ t('editor.game.kick') }}
                  </button>
                }
              </div>
            }
            @if (session.collaborators().length <= 1) {
              <p class="text-meta text-ink-3">{{ t('editor.game.justYou') }}</p>
            }
            <nc-search
              class="mt-1"
              [placeholder]="t('editor.game.inviteByName')"
              hint=""
              (submitted)="invite($event)"
            />
          </nc-section>
          <nc-section banded [title]="t('editor.game.lineage')">
            @if (session.project()?.forkedFromId; as from) {
              <!-- The parent is an id in the project payload and nothing more, so its name is
                   fetched from the public route the link already points at. Until it arrives —
                   and if the parent has since been unpublished or deleted, which is a state a
                   fork outlives — the id stands in, because a lineage that says nothing is worse
                   than one that says a number. -->
              <div class="flex items-center gap-0.5 text-body text-ink-2">
                <nc-icon name="git-branch" [size]="12" />
                {{ t('editor.game.forkedFrom') }}
                <a [href]="'/play/' + from" class="text-sky-ink">
                  {{ parent.data()?.name ?? '#' + from }}
                </a>
                @if (parent.data()?.creator?.username; as who) {
                  <span class="text-ink-3">{{ t('editor.game.by', { who }) }}</span>
                }
              </div>
            }
            <!-- Not the branch mark: that one says this game came off another, and this line says
                 the opposite — others took copies of it. One glyph for both directions made the
                 two rows read as one statement. -->
            <div class="flex items-center gap-0.5 text-body text-ink-2">
              <nc-icon name="duplicate" [size]="12" />
              {{ t('editor.game.remixedBy', { n: session.project()?.forkCount ?? 0 }) }}
            </div>
            @if (!session.project()?.publishedAt) {
              <p class="text-meta text-ink-3">{{ t('editor.game.notForkable') }}</p>
            }
          </nc-section>
        </div>
      </nc-panel-column>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameTabPage implements OnInit {
  protected readonly PANEL_WIDTH = PANEL_WIDTH;
  protected readonly session = inject(WorkSessionService);
  private readonly runtime = inject(RuntimeHostService);
  private readonly toasts = inject(ToastService);
  private readonly qc = inject(QueryClient);
  private readonly dialogs = inject(DialogService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  protected readonly nameMax = NAME_MAX;
  protected readonly summaryMax = SUMMARY_MAX;

  protected readonly name = yTextField(this.session.doc.getText('projectName'));
  protected readonly summary = yTextField(this.session.doc.getText('shortDescription'));
  protected readonly description = yTextField(this.session.doc.getText('longDescription'));
  private readonly tagsRaw = yTextField(this.session.doc.getText('projectTags'));
  protected readonly tags = computed<string[]>(() => {
    try {
      const v = JSON.parse(this.tagsRaw() || '[]') as unknown;
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  });

  protected setTags(v: string[]): void {
    this.tagsRaw.set(JSON.stringify(v));
  }

  protected readonly status = signal<'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED'>('IN_PROGRESS');
  protected readonly monetization = signal<'NONE' | 'ADS' | 'PAID'>('NONE');
  protected readonly price = signal<number | null>(null);
  protected readonly statuses = [
    { value: 'IN_PROGRESS', label: 'In progress', tone: 'orange' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'ARCHIVED', label: 'Archived' },
  ] as const;
  protected readonly monetizations = [
    { value: 'NONE', label: 'None' },
    { value: 'ADS', label: 'Ads' },
    { value: 'PAID', label: 'Paid' },
  ] as const;
  protected readonly canPublish = computed(
    () => this.name().trim().length > 0 && this.summary().trim().length > 0,
  );

  /** The game this one was forked from, so the lineage can name it rather than number it. */
  protected readonly parent = injectRelease(() => this.session.project()?.forkedFromId ?? 0);

  protected readonly cover = injectProjectImage(() => this.session.id);

  ngOnInit(): void {
    const p = this.session.project();
    if (p) {
      this.status.set(p.status);
      this.monetization.set(p.monetization);
      this.price.set(p.price);
    }
  }

  protected setStatus(v: 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED' | undefined): void {
    if (!v) return;
    this.status.set(v);
    void this.patch({ status: v });
  }
  protected setMonetization(v: 'NONE' | 'ADS' | 'PAID' | undefined): void {
    if (!v) return;
    this.monetization.set(v);
    void this.patch({ monetization: v });
  }
  protected setPrice(v: number | null): void {
    this.price.set(v);
    if (v !== null) void this.patch({ price: v });
    else void this.patch({});
  }

  private async patch(body: {
    status?: 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED';
    monetization?: 'NONE' | 'ADS' | 'PAID';
    price?: number;
  }): Promise<void> {
    const p = this.session.project();
    if (!p) return;
    unwrap(
      await projectControllerUpdate({
        path: { id: this.session.id },
        body: { name: this.name() || p.name, shortDesc: this.summary() || p.shortDesc, ...body },
      }),
    );
    await this.session.refreshProject();
  }

  protected async grabFrame(): Promise<void> {
    const rgba = this.runtime.screenshot();
    if (!rgba) {
      this.toasts.show('Run the game first to grab a frame', 'warning');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = Math.sqrt((rgba.length / 4) * (320 / 180));
    const img = new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, Math.round(w));
    const tmp = document.createElement('canvas');
    tmp.width = img.width;
    tmp.height = img.height;
    tmp.getContext('2d')?.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, 320, 180);
    const blob = await new Promise<Blob | null>((r) => {
      canvas.toBlob(r, 'image/png');
    });
    if (blob) await this.uploadBlob(blob);
  }

  protected async upload(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) await this.uploadBlob(file);
  }

  private async uploadBlob(blob: Blob): Promise<void> {
    unwrap(
      await projectControllerUploadProjectImage({
        path: { id: this.session.id },
        body: { file: blob },
      }),
    );
    await this.qc.invalidateQueries({ queryKey: qk.projectImage(this.session.id) });
    this.toasts.show('Cover updated', 'success');
  }

  protected invite(name: string): void {
    if (!name.trim()) return;
    void import('./share.dialog').then(({ addCollaborator }) =>
      addCollaborator(this.session.id, name.trim())
        .then(() => {
          this.toasts.show(`Invited ${name}`, 'success');
        })
        .catch(() => {
          this.toasts.show(`Could not invite ${name}`, 'error');
        }),
    );
  }

  /**
   * Hands back the whole game document as one file.
   *
   * A Yjs update is the same bytes the server stores for a release and the same bytes
   * `seed:content` writes, so an export can be re-imported or inspected without a special format.
   */
  protected confirmDelete(): void {
    this.dialogs
      .open(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate('editor.game.deleteConfirmTitle'),
          message: this.transloco.translate('editor.game.deleteConfirmHint'),
          confirmLabel: this.transloco.translate('editor.game.delete'),
          danger: true,
        },
      })
      .closed.subscribe((ok) => {
        if (ok) void this.deleteGame();
      });
  }

  private async deleteGame(): Promise<void> {
    try {
      unwrap(await projectControllerRemove({ path: { id: this.session.id } }));
    } catch {
      this.toasts.show(this.transloco.translate('editor.game.deleteFailed'), 'error');
      return;
    }
    await this.qc.invalidateQueries({ queryKey: ['projects'] });
    await this.router.navigate(['/my-games']);
  }

  protected exportGame(): void {
    const name = this.session.project()?.name ?? 'game';
    const file = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const update = Y.encodeStateAsUpdate(this.session.doc);
    const url = URL.createObjectURL(
      new Blob([update.buffer as ArrayBuffer], { type: 'application/octet-stream' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file || 'game'}.ncto`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected ago(d: Date | null): string {
    if (!d) return '';
    const s = (Date.now() - d.getTime()) / 1000;
    return s < 60 ? 'just now' : `${String(Math.floor(s / 60))} min ago`;
  }
}
