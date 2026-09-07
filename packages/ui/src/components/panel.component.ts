import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Bordered panel with an optional uppercase header row and header actions (slot `[actions]`). */
@Component({
  selector: 'nc-panel',
  template: `
    @if (title()) {
      <header class="flex h-4 items-center justify-between border-b border-line px-2">
        <span class="label" [class.text-gold-ink]="titleTone() === 'gold'">{{ title() }}</span>
        <div class="flex items-center gap-1"><ng-content select="[actions]" /></div>
      </header>
    }
    <!-- A flex column that fills the panel, so content can pin something to the bottom edge with
         mt-auto. As a block-level column with stretched children it lays out exactly as before. -->
    <div class="flex min-h-0 flex-1 flex-col" [class.p-2]="padded()"><ng-content /></div>
  `,
  host: { class: 'block rounded-md border border-line bg-panel' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PanelComponent {
  readonly title = input<string>();
  readonly titleTone = input<'default' | 'gold'>('default');
  /** Turn off the body padding when the content owns its own full-bleed bands. */
  readonly padded = input(true);
}
