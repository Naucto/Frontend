import type { OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { EmptyStateComponent } from '@naucto/ui';

import { type EditorTab, EditorUiStore } from './state/editor-ui.store';

/** Stand-in for tabs that ship in later stack layers. */
@Component({
  selector: 'nc-placeholder-tab-page',
  imports: [EmptyStateComponent],
  template: `
    <nc-empty-state
      icon="hourglass"
      [title]="tab.toUpperCase()"
      hint="This tab lands in a later step of the stack."
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceholderTabPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly ui = inject(EditorUiStore);
  protected readonly tab = this.route.snapshot.data.tab as EditorTab;
  ngOnInit(): void {
    this.ui.setTab(this.tab);
  }
}
