import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Tiny square presence dot: jade online, ink-4 offline. */
@Component({
  selector: 'nc-online-dot',
  template: '',
  host: {
    class: 'inline-block h-1 w-1 rounded-xs',
    '[class.bg-jade]': 'online()',
    '[class.bg-ink-4]': '!online()',
    role: 'img',
    '[attr.aria-label]': 'online() ? "Online" : "Offline"',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnlineDotComponent {
  readonly online = input(false);
}
