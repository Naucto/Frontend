import { SlicePipe } from '@angular/common';
import type { OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { unwrap } from '@app/core/api/api-errors';
import { RuntimeHostService } from '@app/shared/game-screen/runtime-host.service';
import { qk } from '@app/shared/queries/query-keys';
import { yTextField } from '@app/shared/yjs/y-signal';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  projectControllerGetProjectImage,
  projectControllerUpdate,
  projectControllerUploadProjectImage,
} from '@naucto/api-client';
import {
  AvatarComponent,
  ButtonDirective,
  FieldComponent,
  HelpDotComponent,
  IconComponent,
  InputDirective,
  LabelComponent,
  SearchComponent,
  SectionComponent,
  SegmentedComponent,
  TagInputComponent,
  ToastService,
} from '@naucto/ui';
import { injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import * as Y from 'yjs';

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
    SearchComponent,
    SectionComponent,
    SegmentedComponent,
    TagInputComponent,
  ],
  template: `
    <div *transloco="let t" class="grid h-full grid-rows-[40px_minmax(0,1fr)]">
      <!-- One strip across both columns: the tab says what it is and when it last saved, and the
           inspector's own heading sits over the inspector, as the artboard draws them. -->
      <div class="grid grid-cols-[minmax(0,1fr)_381px] border-b border-line bg-panel">
        <div class="flex min-w-0 items-center gap-1.5 pr-1.5 pl-2">
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
        <div class="flex items-center gap-1 border-l border-line px-1.75">
          <span class="font-mono text-meta tracking-strip text-ink uppercase">
            {{ t('editor.game.publishing') }}
          </span>
          <span class="flex-1"></span>
          <button ncButton variant="secondary" size="sm" (click)="exportGame()">
            <nc-icon name="download" [size]="12" />
            {{ t('editor.game.export') }}
          </button>
        </div>
      </div>

      <div class="grid min-h-0 grid-cols-[minmax(0,1fr)_381px]">
        <div class="overflow-auto bg-inset px-2.75 py-2.5">
          <div class="grid grid-cols-[320px_minmax(0,1fr)] gap-2.75">
            <div>
              <nc-label class="mb-1">{{ t('editor.game.icon') }}</nc-label>
              <div
                class="relative aspect-video overflow-hidden rounded-sm border border-line bg-inset"
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
                  class="absolute top-1 right-1 rounded-xs bg-page/80 px-0.5 text-label text-ink-2"
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
                <input
                  ncInput
                  id="g-summary"
                  [ngModel]="summary()"
                  (ngModelChange)="summary.set($event)"
                  [maxlength]="summaryMax"
                  [placeholder]="t('editor.game.summaryPlaceholder')"
                />
              </nc-field>
              <nc-field
                [label]="t('editor.game.description')"
                for="g-desc"
                [hint]="t('editor.game.markdown')"
              >
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

        <aside class="overflow-auto border-l border-line bg-panel p-2">
          @if (!canPublish()) {
            <p class="mb-2 text-meta text-orange-ink">{{ t('editor.game.publishBlocked') }}</p>
          }
          <div class="grid min-w-0 gap-3">
            <nc-section [title]="t('editor.game.status')">
              <nc-help-dot actions [text]="t('editor.game.statusHelp')" />
              <nc-segmented
                [options]="statuses"
                [value]="status()"
                (valueChange)="setStatus($event)"
                label="Status"
              />
              <div class="mt-1 flex justify-between text-label text-ink-3">
                <span>{{ t('editor.game.published') }}</span>
                <span>
                  {{
                    session.project()?.publishedAt
                      ? (session.project()?.publishedAt | slice: 0 : 10)
                      : t('editor.game.never')
                  }}
                </span>
              </div>
            </nc-section>
            <nc-section [title]="t('editor.game.monetization')">
              <nc-help-dot actions [text]="t('editor.game.monetizationHelp')" />
              <!-- The design fills the chosen tier in ink, not the neutral raised: it is a
                   statement about the game, not a passive selection. -->
              <nc-segmented
                fill
                tone="ink"
                [options]="monetizations"
                [value]="monetization()"
                (valueChange)="setMonetization($event)"
                label="Monetization"
              />
              <nc-field [label]="t('editor.game.price')" for="g-price" class="mt-1">
                <input
                  ncInput
                  id="g-price"
                  type="number"
                  min="0"
                  step="0.5"
                  [disabled]="monetization() !== 'PAID'"
                  [ngModel]="price()"
                  (ngModelChange)="setPrice($event)"
                />
              </nc-field>
            </nc-section>
            <nc-section [title]="t('editor.game.inSession')">
              <span actions class="label text-ink-4">{{ session.collaborators().length }}</span>
              @for (c of session.collaborators(); track c.clientId) {
                <div class="flex items-center gap-1 py-0.5">
                  <nc-avatar [name]="c.name" [colour]="c.colour" [size]="24" />
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
            <nc-section [title]="t('editor.game.lineage')">
              @if (session.project()?.forkedFromId; as from) {
                <div class="flex items-center gap-0.5 text-body text-ink-2">
                  <nc-icon name="git-branch" [size]="12" />
                  {{ t('editor.game.forkedFrom') }}
                  <a [href]="'/play/' + from" class="text-gold-ink">#{{ from }}</a>
                </div>
              }
              <div class="flex items-center gap-0.5 text-body text-ink-2">
                <nc-icon name="git-branch" [size]="12" />
                {{ t('editor.game.remixedBy', { n: session.project()?.forkCount ?? 0 }) }}
              </div>
              @if (!session.project()?.publishedAt) {
                <p class="text-meta text-ink-3">{{ t('editor.game.notForkable') }}</p>
              }
            </nc-section>
          </div>
        </aside>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameTabPage implements OnInit {
  protected readonly session = inject(WorkSessionService);
  private readonly runtime = inject(RuntimeHostService);
  private readonly toasts = inject(ToastService);
  private readonly qc = inject(QueryClient);
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
    { value: 'IN_PROGRESS', label: 'In progress' },
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

  protected readonly cover = injectQuery(() => ({
    queryKey: qk.projectImage(this.session.id),
    queryFn: async () => {
      const res = await projectControllerGetProjectImage({ path: { id: this.session.id } });
      const data = res.data as { url?: string } | undefined;
      return res.response?.status === 200 ? (data?.url ?? null) : null;
    },
  }));

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
