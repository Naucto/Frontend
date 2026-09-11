import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon.component';

/**
 * Play, rewind and stop, as one control.
 *
 * Not a tool group: that one is a radio group, where the choice persists and one option is always
 * current. Here the first button toggles between two states and the other two act and are over — a
 * transport has no selected member.
 *
 * There is no size on it. The kit carries two densities and the whole editor runs at the big one;
 * a strip that wants the drawn size wears `nc-density-small` and everything inside it follows.
 */
@Component({
  selector: 'nc-transport',
  imports: [ButtonDirective, IconComponent],
  template: `
    <span class="flex items-center gap-0.5 rounded-sm border border-line bg-inset p-0.5">
      @if (playing()) {
        <button
          ncButton
          variant="ghost"
          size="sm"
          iconOnly
          [attr.aria-label]="pauseLabel()"
          (click)="paused.emit()"
        >
          <nc-icon name="pause" [size]="24" />
        </button>
      } @else {
        <button
          ncButton
          variant="ghost"
          size="sm"
          iconOnly
          [attr.aria-label]="playLabel()"
          (click)="started.emit()"
        >
          <nc-icon name="play" [size]="24" class="text-hot-ink" />
        </button>
      }
      <!-- Back to the top without stopping, which is what you want when you are listening to a bar
           again rather than putting the take down. Stopping also returns to the start, so without
           this the only way back is to end the take. -->
      <button
        ncButton
        variant="ghost"
        size="sm"
        iconOnly
        [attr.aria-label]="rewindLabel()"
        [disabled]="!canRewind()"
        (click)="rewound.emit()"
      >
        <nc-icon name="prev" [size]="24" />
      </button>
      <button
        ncButton
        variant="ghost"
        size="sm"
        iconOnly
        [attr.aria-label]="stopLabel()"
        [disabled]="!canStop()"
        (click)="stopped.emit()"
      >
        <nc-icon name="stop" [size]="24" />
      </button>
    </span>
  `,
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransportComponent {
  readonly playing = input(false, { transform: booleanAttribute });
  readonly canRewind = input(true, { transform: booleanAttribute });
  readonly canStop = input(true, { transform: booleanAttribute });
  readonly playLabel = input('Play');
  readonly pauseLabel = input('Pause');
  readonly rewindLabel = input('Back to the start');
  readonly stopLabel = input('Stop');

  readonly started = output();
  readonly paused = output();
  readonly rewound = output();
  readonly stopped = output();
}
