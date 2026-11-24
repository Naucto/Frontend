import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

import { type IconName } from '../icons/glyphs';
import { IconComponent } from './icon.component';

/**
 * A picture in an inset frame of a fixed ratio, with its actions in a bar along its foot: a cover
 * and the buttons that set it, a screenshot and the ways to take one.
 *
 * It shows `src`, or what is projected in its place (a video, chips over the picture), or with
 * neither its empty state. The actions are projected as `[actions]`, each an `ncMediaAction`.
 * With `dropImages`, an image dropped on it is handed over as `imageDrop`.
 */
@Component({
  selector: 'nc-media-frame',
  imports: [IconComponent],
  templateUrl: './media-frame.component.html',
  host: {
    '[class]': 'classes()',
    '[style.aspect-ratio]': 'ratio()',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'dragging.set(false)',
    '(drop)': 'onDrop($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaFrameComponent {
  readonly src = input<string | null>();
  readonly alt = input('');
  /** A CSS aspect ratio; the game's screen by default. */
  readonly ratio = input('16 / 9');
  /** `cover` fills the frame, as a game's picture does; `contain` shows all of an image of any shape. */
  readonly fit = input<'cover' | 'contain'>('cover');
  /** Whether the empty state shows; by default, while there is no `src`. */
  readonly empty = input<boolean | undefined>(undefined);
  readonly emptyIcon = input<IconName>('image');
  readonly emptyLabel = input('');
  /** `hot` while what it shows is being recorded. */
  readonly tone = input<'default' | 'hot'>('default');
  readonly dropImages = input(false, { transform: booleanAttribute });
  readonly imageDrop = output<File>();

  protected readonly dragging = signal(false);
  protected readonly showEmpty = computed(() => this.empty() ?? !this.src());
  protected readonly classes = computed(() => {
    const edge = this.dragging()
      ? 'bevel-edge-active-ink'
      : this.tone() === 'hot'
        ? 'bevel-edge-hot'
        : 'bevel-edge-line-strong';
    return `relative block overflow-hidden flat-sm bevel-fill-inset ${edge}`;
  });

  protected onDragOver(event: DragEvent): void {
    if (!this.dropImages()) {
      return;
    }
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    if (!this.dropImages()) {
      return;
    }
    event.preventDefault();
    this.dragging.set(false);
    const file = [...(event.dataTransfer?.files ?? [])].find((item) =>
      item.type.startsWith('image/'),
    );
    if (file) {
      this.imageDrop.emit(file);
    }
  }
}
