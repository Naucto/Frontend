import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  ChipComponent,
  DialogShellComponent,
  IconComponent,
  NoticeComponent,
} from '@naucto/ui';

/** Which zone the dialog is filling, which is all that differs between its two windows. */
export type ProfileImageZone = 'picture' | 'banner';

export interface ProfileImageDialogData {
  zone: ProfileImageZone;
}

export interface ProfileImageResult {
  kind: 'save';
  blob: Blob;
}

/**
 * The window each zone is cropped through: square for the picture, and for the banner the box it
 * fills on a 1920 px page, which is 2:1. A page of another width covers that box with it, so a
 * narrower one cuts its sides and nothing is ever stretched.
 */
const WINDOW: Record<ProfileImageZone, { ratio: number; out: { w: number; h: number } }> = {
  picture: { ratio: 1, out: { w: 256, h: 256 } },
  banner: { ratio: 2, out: { w: 1920, h: 960 } },
};

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';
/** Below this the handles would sit on top of each other and the rectangle stops reading as one. */
const MIN_SIDE = 32;

/** The selection, in the coordinates of the image as it is displayed. */
interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Grip = 'move' | 'nw' | 'ne' | 'sw' | 'se';

@Component({
  selector: 'nc-profile-image-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    ChipComponent,
    DialogShellComponent,
    IconComponent,
    NoticeComponent,
  ],
  templateUrl: './profile-image.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileImageDialogComponent {
  protected readonly data = inject<ProfileImageDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<ProfileImageResult | undefined>>(DialogRef);
  private readonly win = WINDOW[this.data.zone];
  protected readonly accept = ACCEPT;
  protected readonly formats = ['PNG', 'JPG', 'GIF'];

  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');
  private readonly img = viewChild<ElementRef<HTMLImageElement>>('img');
  protected readonly file = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly url = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Where the whole image sits in the frame, letterboxed — the box the selection lives inside. */
  protected readonly fit = signal<Crop>({ x: 0, y: 0, w: 0, h: 0 });
  protected readonly crop = signal<Crop>({ x: 0, y: 0, w: 0, h: 0 });

  protected readonly grips: { grip: Grip; left: string; top: string; cursor: string }[] = [
    { grip: 'nw', left: '-4px', top: '-4px', cursor: 'cursor-nwse-resize' },
    { grip: 'ne', left: 'calc(100% - 5px)', top: '-4px', cursor: 'cursor-nesw-resize' },
    { grip: 'sw', left: '-4px', top: 'calc(100% - 5px)', cursor: 'cursor-nesw-resize' },
    { grip: 'se', left: 'calc(100% - 5px)', top: 'calc(100% - 5px)', cursor: 'cursor-nwse-resize' },
  ];

  protected reset(): void {
    const el = this.img()?.nativeElement;
    const box = this.frame().nativeElement.getBoundingClientRect();
    if (!el || !box.width) {
      return;
    }

    const scale = Math.min(box.width / el.naturalWidth, box.height / el.naturalHeight);
    const width = el.naturalWidth * scale;
    const height = el.naturalHeight * scale;
    const fit = { x: (box.width - width) / 2, y: (box.height - height) / 2, w: width, h: height };
    this.fit.set(fit);

    const cw = Math.min(fit.w, fit.h * this.win.ratio);
    const ch = cw / this.win.ratio;
    this.crop.set({ x: fit.x + (fit.w - cw) / 2, y: fit.y + (fit.h - ch) / 2, w: cw, h: ch });
  }

  protected grab(event: PointerEvent, grip: Grip): void {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture(event.pointerId);
    const start = { ...this.crop(), px: event.clientX, py: event.clientY };

    const move = (moveEvent: PointerEvent): void => {
      const dx = moveEvent.clientX - start.px;
      const dy = moveEvent.clientY - start.py;
      this.crop.set(grip === 'move' ? this.moved(start, dx, dy) : this.resized(start, grip, dx));
    };
    const up = (): void => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  private moved(start: Crop, dx: number, dy: number): Crop {
    const fit = this.fit();
    return {
      ...start,
      x: Math.min(Math.max(start.x + dx, fit.x), fit.x + fit.w - start.w),
      y: Math.min(Math.max(start.y + dy, fit.y), fit.y + fit.h - start.h),
    };
  }

  /**
   * One drag decides one number — the width — and the height follows from the zone's ratio, so a
   * selection can never be dragged into a shape the zone would then have to distort.
   */
  private resized(start: Crop, grip: Grip, dx: number): Crop {
    const fit = this.fit();
    const west = grip === 'nw' || grip === 'sw';
    const north = grip === 'nw' || grip === 'ne';
    const anchorX = west ? start.x + start.w : start.x;
    const anchorY = north ? start.y + start.h : start.y;

    const room = west ? anchorX - fit.x : fit.x + fit.w - anchorX;
    const vertical = north ? anchorY - fit.y : fit.y + fit.h - anchorY;
    const wanted = start.w + (west ? -dx : dx);
    const width = Math.min(Math.max(wanted, MIN_SIDE), room, vertical * this.win.ratio, fit.w);
    const height = width / this.win.ratio;

    const x = west ? anchorX - width : anchorX;
    const y = north ? anchorY - height : anchorY;

    return { x, y, w: width, h: height };
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file) {
      this.accepted(file);
    }
  }

  protected onPick(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.accepted(file);
    }
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

  protected async save(): Promise<void> {
    const el = this.img()?.nativeElement;
    const fit = this.fit();
    if (!el || !fit.w) {
      return;
    }
    this.busy.set(true);
    try {
      const crop = this.crop();
      // The selection is in displayed pixels; the source is what actually gets cut.
      const scale = el.naturalWidth / fit.w;
      const { w, h } = this.win.out;
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      // A photograph, not the grid art the rest of this draws: resampled, not stepped.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        el,
        (crop.x - fit.x) * scale,
        (crop.y - fit.y) * scale,
        crop.w * scale,
        crop.h * scale,
        0,
        0,
        w,
        h,
      );
      this.ref.close({ kind: 'save', blob: await canvas.convertToBlob({ type: 'image/png' }) });
    } finally {
      this.busy.set(false);
    }
  }
}
