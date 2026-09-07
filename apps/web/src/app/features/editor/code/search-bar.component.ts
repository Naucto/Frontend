import { ChangeDetectionStrategy, Component, computed, model, output, signal } from '@angular/core';
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
  template: `
    <div
      *transloco="let t"
      class="flex flex-col gap-1 border-t border-line bg-panel px-1.75 py-1.5"
    >
      <div class="flex items-center gap-1">
        <button
          ncButton
          variant="ghost"
          size="sm"
          iconOnly
          [attr.aria-label]="t('editor.code.replaceMode')"
          [attr.aria-expanded]="replacing()"
          (click)="replacing.set(!replacing())"
        >
          <nc-icon [name]="replacing() ? 'chevron-down' : 'chevron-right'" [size]="12" />
        </button>
        <input
          ncInput
          class="min-w-0 flex-1 font-mono"
          [attr.aria-label]="t('editor.code.find')"
          [placeholder]="t('editor.code.find')"
          autocomplete="off"
          spellcheck="false"
          [value]="search()"
          (input)="search.set($any($event.target).value)"
          (keydown.enter)="next.emit()"
          (keydown.escape)="closed.emit()"
        />
        <button
          ncButton
          variant="secondary"
          size="sm"
          iconOnly
          [attr.aria-label]="t('editor.code.previous')"
          (click)="previous.emit()"
        >
          <nc-icon name="chevron-up" [size]="12" />
        </button>
        <button
          ncButton
          variant="secondary"
          size="sm"
          iconOnly
          [attr.aria-label]="t('editor.code.next')"
          (click)="next.emit()"
        >
          <nc-icon name="chevron-down" [size]="12" />
        </button>
        <button
          ncButton
          variant="secondary"
          size="sm"
          iconOnly
          [attr.aria-label]="t('editor.code.selectAll')"
          (click)="selectAll.emit()"
        >
          <nc-icon name="list" [size]="12" />
        </button>
        <nc-checkbox [(checked)]="caseSensitive">{{ t('editor.code.matchCase') }}</nc-checkbox>
        <nc-checkbox [(checked)]="regexp">{{ t('editor.code.regexp') }}</nc-checkbox>
        <nc-checkbox [(checked)]="wholeWord">{{ t('editor.code.wholeWord') }}</nc-checkbox>
        <span class="flex-1"></span>
        <button
          ncButton
          variant="ghost"
          size="sm"
          iconOnly
          [attr.aria-label]="t('editor.code.closeSearch')"
          (click)="closed.emit()"
        >
          <nc-icon name="close" [size]="12" />
        </button>
      </div>

      @if (replacing()) {
        <div class="flex items-center gap-1">
          <!-- Indented by the width of the control that opened this row, so the two fields line up. -->
          <span class="w-[24px] shrink-0"></span>
          <input
            ncInput
            class="min-w-0 flex-1 font-mono"
            [attr.aria-label]="t('editor.code.replaceWith')"
            [placeholder]="t('editor.code.replaceWith')"
            autocomplete="off"
            spellcheck="false"
            [value]="replace()"
            (input)="replace.set($any($event.target).value)"
            (keydown.escape)="closed.emit()"
          />
          <button
            ncButton
            variant="secondary"
            size="sm"
            iconOnly
            [attr.aria-label]="t('editor.code.replaceOne')"
            (click)="replaceOne.emit()"
          >
            <nc-icon name="edit" [size]="12" />
          </button>
          <button
            ncButton
            variant="secondary"
            size="sm"
            iconOnly
            [attr.aria-label]="t('editor.code.replaceAll')"
            (click)="replaceEvery.emit()"
          >
            <nc-icon name="repeat" [size]="12" />
          </button>
        </div>
      }
    </div>
  `,
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

  readonly terms = computed<SearchTerms>(() => ({
    search: this.search(),
    replace: this.replace(),
    caseSensitive: this.caseSensitive(),
    regexp: this.regexp(),
    wholeWord: this.wholeWord(),
  }));
}
