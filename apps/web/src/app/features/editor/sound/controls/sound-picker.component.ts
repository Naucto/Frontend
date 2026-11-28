import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  ChangeChipComponent,
  type ChangeKind,
  LooksOnlyDirective,
  MarkComponent,
  OptionDirective,
  PopoverDirective,
  PopoverPanelComponent,
  type PresenceDot,
  PresenceDotsComponent,
  TooltipDirective,
} from '@naucto/ui';

import { EditorModeService } from '../../state/editor-mode.service';

export interface PickerItem {
  key: string;
  number: string;
  name: string;
  swatch?: string;
  free?: boolean;
  canDuplicate?: boolean;
  canRemove?: boolean;
  /** How it differs in diff mode, drawn at the end of its row. */
  change?: ChangeKind;
}

@Component({
  selector: 'nc-sound-picker',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    LooksOnlyDirective,
    ChangeChipComponent,
    MarkComponent,
    OptionDirective,
    PopoverDirective,
    PopoverPanelComponent,
    PresenceDotsComponent,
    TooltipDirective,
  ],
  templateUrl: './sound-picker.component.html',
  host: { class: 'flex min-w-0 shrink' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundPickerComponent {
  readonly title = input.required<string>();
  readonly addLabel = input.required<string>();
  readonly items = input.required<readonly PickerItem[]>();
  /** How many of the items differ in diff mode, counted on the button as the rail counts. */
  protected readonly changed = computed(() => this.items().filter((item) => item.change).length);
  readonly current = input.required<PickerItem>();
  readonly maxName = input(24);
  readonly peersOf = input<(key: string) => readonly PresenceDot[]>(() => []);
  readonly picked = output<string>();
  readonly created = output();
  readonly duplicated = output<string>();
  readonly removed = output<string>();
  readonly renamed = output<{ key: string; name: string }>();

  private readonly mode = inject(EditorModeService);
  protected readonly renaming = signal<string | null>(null);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  constructor() {
    effect(() => {
      const element = this.field()?.nativeElement;
      if (element) {
        element.focus();
        element.select();
      }
    });
  }

  protected press(item: PickerItem): void {
    if (item.key === this.current().key) {
      if (this.mode.canWrite()) {
        this.renaming.set(item.key);
      }
      return;
    }
    this.renaming.set(null);
    this.picked.emit(item.key);
  }

  protected commit(key: string, name: string): void {
    if (this.renaming() !== key) {
      return;
    }
    this.renaming.set(null);
    this.renamed.emit({ key, name: name.trim() });
  }

  protected cancel(): void {
    this.renaming.set(null);
  }
}
