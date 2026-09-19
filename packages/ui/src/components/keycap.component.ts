import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Keyboard / gamepad binding chip (ARROWS, Z, ESC, D-PAD). */
@Component({
  selector: 'nc-keycap',
  template: '<ng-content />',
  host: {
    class:
      'inline-flex min-w-[20px] items-center justify-center gap-0.5 rounded-sm border border-line-strong bg-line px-[9px] py-[5px] font-mono text-meta uppercase tracking-button text-ink-body',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeycapComponent {}
