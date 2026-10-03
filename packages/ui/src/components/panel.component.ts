import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Bordered panel with an optional uppercase header row and header actions (slot `[actions]`). */
@Component({
  selector: 'nc-panel',
  templateUrl: './panel.component.html',
  host: { class: 'block rounded-md border border-line bg-panel' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PanelComponent {
  readonly title = input<string>();
  readonly titleTone = input<'default' | 'gold'>('default');
  /** Turn off the body padding when the content owns its own full-bleed bands. */
  readonly padded = input(true);
}
