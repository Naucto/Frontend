import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { LearnPage } from './learn.page';

/** Two-segment doc slugs ("api/gfx", "tutorials/pong") share the Learn page. */
@Component({
  selector: 'nc-learn-nested-page',
  imports: [LearnPage],
  template: `
    <nc-learn-page [path]="joined()" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearnNestedPage {
  readonly a = input.required<string>();
  readonly b = input.required<string>();
  protected readonly joined = computed(() => `${this.a()}/${this.b()}`);
}
