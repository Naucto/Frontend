import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, DialogShellComponent, IconComponent, SliderComponent } from '@naucto/ui';

/** Which zone the dialog is filling, which is all that differs between its two windows. */
export type ProfileImageZone = 'picture' | 'banner';

export interface ProfileImageDialogData {
  zone: ProfileImageZone;
  /** Whether there is something to take away — RESET and REMOVE are drawn only then. */
  hasImage: boolean;
}

export type ProfileImageResult = { kind: 'save'; blob: Blob } | { kind: 'clear' };

/**
 * The window each zone is cropped through.
 *
 * One dialog serves both, and only the window changes — square for the picture, the banner's own
 * display ratio for the banner, because a 16:9 window would lie about the strip it feeds.
 */
const WINDOW: Record<ProfileImageZone, { ratio: number; out: { w: number; h: number } }> = {
  picture: { ratio: 1, out: { w: 256, h: 256 } },
  banner: { ratio: 1918 / 220, out: { w: 1918, h: 220 } },
};

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/gif';

@Component({
  selector: 'nc-profile-image-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    IconComponent,
    SliderComponent,
  ],
  template: `
    <nc-dialog-shell *transloco="let t" [title]="t('profile.image.' + data.zone)">
      <p class="label mb-1 text-ink-4">{{ t('profile.image.spec.' + data.zone) }}</p>

      <div
        class="relative overflow-hidden rounded-sm border border-line bg-inset"
        [style.aspect-ratio]="win.ratio"
        (dragover)="$event.preventDefault()"
        (drop)="onDrop($event)"
      >
        @if (url(); as src) {
          <img
            #img
            [src]="src"
            alt=""
            class="pixelated absolute origin-top-left select-none"
            [style.transform]="transform()"
            (pointerdown)="onGrab($event)"
            (load)="fit()"
          />
        } @else {
          <div class="flex h-full flex-col items-center justify-center gap-1 text-ink-3">
            <nc-icon name="cloud-upload" [size]="24" />
            <p class="text-body">{{ t('profile.image.drop') }}</p>
            <p class="label text-ink-4">{{ t('profile.image.limits') }}</p>
            <button ncButton variant="secondary" size="sm" class="mt-1" (click)="file.click()">
              {{ t('profile.image.browse') }}
            </button>
          </div>
        }
      </div>

      @if (url()) {
        <nc-slider
          class="mt-2"
          [min]="1"
          [max]="4"
          [step]="0.01"
          [(value)]="zoom"
          hideLabel
          [label]="t('profile.image.zoom')"
        />
      }
      @if (error(); as e) {
        <p class="mt-1 text-meta text-hot-ink">{{ e }}</p>
      }

      <input
        #file
        type="file"
        class="hidden"
        [accept]="accept"
        (change)="onPick($event)"
        [attr.aria-label]="t('profile.image.browse')"
      />

      <ng-container footer>
        @if (data.hasImage) {
          <button ncButton variant="ghost" (click)="ref.close({ kind: 'clear' })">
            {{ t('profile.image.clear.' + data.zone) }}
          </button>
        }
        <button ncButton variant="ghost" (click)="ref.close()">
          {{ t('editor.code.cancel') }}
        </button>
        <button ncButton variant="primary" [disabled]="!url() || busy()" (click)="save()">
          {{ t('profile.image.save') }}
        </button>
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileImageDialogComponent {
  protected readonly data = inject<ProfileImageDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<ProfileImageResult | undefined>>(DialogRef);
  protected readonly win = WINDOW[this.data.zone];
  protected readonly accept = ACCEPT;

  private readonly img = viewChild<ElementRef<HTMLImageElement>>('img');
  protected readonly file = viewChild.required<ElementRef<HTMLInputElement>>('file');

  protected readonly url = signal<string | null>(null);
  protected readonly zoom = signal(1);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly pan = signal({ x: 0, y: 0 });
  /** Scale that just covers the window, so the crop is never fed a transparent edge. */
  private readonly cover = signal(1);

  protected readonly transform = computed(() => {
    const { x, y } = this.pan();
    const scale = this.cover() * this.zoom();
    return `translate(${String(x)}px, ${String(y)}px) scale(${String(scale)})`;
  });

  protected fit(): void {
    const el = this.img()?.nativeElement;
    if (!el) return;
    const box = el.parentElement?.getBoundingClientRect();
    if (!box) return;
    this.cover.set(Math.max(box.width / el.naturalWidth, box.height / el.naturalHeight));
    this.pan.set({ x: 0, y: 0 });
    this.zoom.set(1);
  }

  protected onGrab(event: PointerEvent): void {
    const el = event.currentTarget as HTMLElement;
    const start = { ...this.pan(), px: event.clientX, py: event.clientY };
    el.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent): void => {
      this.pan.set({ x: start.x + e.clientX - start.px, y: start.y + e.clientY - start.py });
    };
    const up = (): void => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file) this.accepted(file);
  }

  protected onPick(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.accepted(file);
  }

  private accepted(file: File): void {
    if (!ACCEPT.split(',').includes(file.type)) {
      this.error.set('That file type is not one of PNG, JPG or GIF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      this.error.set('That image is over 2 MB.');
      return;
    }
    this.error.set(null);
    this.url.set(URL.createObjectURL(file));
  }

  /** Redraw what the window is showing at the size the zone is stored in. */
  protected async save(): Promise<void> {
    const el = this.img()?.nativeElement;
    const box = el?.parentElement?.getBoundingClientRect();
    if (!el || !box) return;
    this.busy.set(true);
    try {
      const { w, h } = this.win.out;
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const scale = this.cover() * this.zoom();
      const { x, y } = this.pan();
      const k = w / box.width;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(el, x * k, y * k, el.naturalWidth * scale * k, el.naturalHeight * scale * k);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      this.ref.close({ kind: 'save', blob });
    } finally {
      this.busy.set(false);
    }
  }
}
