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
 * There is no size on it: it follows the density of the strip it sits in.
 */
@Component({
  selector: 'nc-transport',
  imports: [ButtonDirective, IconComponent],
  templateUrl: './transport.component.html',
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
  /** Back to the start without stopping; stopping also returns there, but ends the take. */
  readonly rewound = output();
  readonly stopped = output();
}
