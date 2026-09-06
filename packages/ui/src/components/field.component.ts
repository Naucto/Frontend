import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Label + control + hint/error/counter wrapper. Put the control in the default slot. */
@Component({
  selector: 'nc-field',
  template: `
    <div class="mb-1 flex items-center justify-between gap-1">
      <label [attr.for]="for()" class="label">{{ label() }}</label>
      <span class="flex items-center gap-0.75">
        @if (counter()) {
          <span class="text-label text-ink-4">{{ counter() }}</span>
        }
        <ng-content select="[actions]" />
      </span>
    </div>
    <ng-content />
    @if (error()) {
      <p class="mt-0.5 text-meta text-hot-ink" role="alert">{{ error() }}</p>
    } @else if (hint()) {
      <p class="mt-0.5 text-meta text-ink-3">{{ hint() }}</p>
    }
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldComponent {
  readonly label = input.required<string>();
  readonly for = input<string>();
  readonly hint = input<string>();
  readonly error = input<string>();
  readonly counter = input<string>();
}
