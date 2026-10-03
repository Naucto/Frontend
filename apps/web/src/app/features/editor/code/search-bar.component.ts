import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, CheckboxComponent, IconComponent, InputDirective } from '@naucto/ui';

export interface SearchTerms {
  search: string;
  replace: string;
  caseSensitive: boolean;
  regexp: boolean;
  wholeWord: boolean;
}

/** Find, and replace when it is asked for. */
@Component({
  selector: 'nc-search-bar',
  imports: [TranslocoDirective, ButtonDirective, CheckboxComponent, IconComponent, InputDirective],
  templateUrl: './search-bar.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchBarComponent {
  readonly search = model('');
  readonly replace = model('');
  readonly caseSensitive = model(false);
  readonly regexp = model(false);
  readonly wholeWord = model(false);
  protected readonly replacing = signal(false);

  readonly next = output();
  readonly previous = output();
  readonly selectAll = output();
  readonly replaceOne = output();
  readonly replaceEvery = output();
  readonly closed = output();

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  focus(): void {
    const el = this.field()?.nativeElement;
    el?.focus();
    el?.select();
  }

  readonly terms = computed<SearchTerms>(() => ({
    search: this.search(),
    replace: this.replace(),
    caseSensitive: this.caseSensitive(),
    regexp: this.regexp(),
    wholeWord: this.wholeWord(),
  }));
}
