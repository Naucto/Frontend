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

  protected onKey(e: KeyboardEvent): void {
    const delta =
      e.key === 'ArrowLeft'
        ? -1
        : e.key === 'ArrowRight'
          ? 1
          : e.key === 'ArrowUp'
            ? -COLUMNS
            : e.key === 'ArrowDown'
              ? COLUMNS
              : 0;
    if (!delta) return;
    e.preventDefault();
    const next = Math.min(this.colours().length - 1, Math.max(0, this.value() + delta));
    this.value.set(next);
    this.host.nativeElement.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  }
}
