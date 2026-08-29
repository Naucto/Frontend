import { ChangeDetectionStrategy, Component, input, numberAttribute } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, EmptyStateComponent } from '@naucto/ui';

/** Stand-in for /edit/:id until the editor shell ships. */
@Component({
  selector: 'nc-editor-placeholder-page',
  imports: [RouterLink, TranslocoDirective, ButtonDirective, EmptyStateComponent],
  template: `
    <nc-empty-state
      *transloco="let t"
      icon="code"
      [title]="'Game #' + id()"
      [hint]="t('games.editorSoon')"
    >
      <a ncButton variant="secondary" routerLink="/games">{{ t('games.backToGames') }}</a>
    </nc-empty-state>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorPlaceholderPage {
  readonly id = input.required({ transform: numberAttribute });
}
