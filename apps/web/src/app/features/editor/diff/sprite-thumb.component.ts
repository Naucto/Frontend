import {
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  input,
  viewChild,
} from '@angular/core';
import { SPRITE_SIZE } from '@naucto/engine';

/** One sprite's pixels, drawn square and sharp: what a change's before and after are shown with. */
@Component({
  selector: 'nc-sprite-thumb',
  template: '<canvas #canvas class="pixelated block size-full" width="8" height="8"></canvas>',
  host: { class: 'block bg-inset' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpriteThumbComponent {
  /** Palette indexes, row by row; colour 0 is drawn as the ground shows through. */
  readonly pixels = input.required<Uint8Array>();
  readonly palette = input.required<readonly string[]>();
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    effect(() => {
      const ctx = this.canvas().nativeElement.getContext('2d');
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
      this.pixels().forEach((colour, i) => {
        if (colour) {
          ctx.fillStyle = this.palette()[colour] ?? '#000';
          ctx.fillRect(i % SPRITE_SIZE, Math.floor(i / SPRITE_SIZE), 1, 1);
        }
      });
    });
  }
}
