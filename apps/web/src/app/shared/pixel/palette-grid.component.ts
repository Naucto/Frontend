import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  model,
} from '@angular/core';

const COLUMNS = 8;

/** The swatches of a game palette; one is selected. */
@Component({
  selector: 'nc-palette-grid',
  templateUrl: './palette-grid.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaletteGridComponent {
  readonly colours = input.required<readonly string[]>();
  readonly value = model(0);
  readonly label = input('Palette');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected onKey(event: KeyboardEvent): void {
    const delta =
      event.key === 'ArrowLeft'
        ? -1
        : event.key === 'ArrowRight'
          ? 1
          : event.key === 'ArrowUp'
            ? -COLUMNS
            : event.key === 'ArrowDown'
              ? COLUMNS
              : 0;
    if (!delta) {
      return;
    }
    event.preventDefault();
    const next = Math.min(this.colours().length - 1, Math.max(0, this.value() + delta));
    this.value.set(next);
    this.host.nativeElement.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  }
}
