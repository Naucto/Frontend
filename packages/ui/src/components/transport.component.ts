import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { IconComponent } from './icon.component';
import { CELL, joined } from './selection-styles';

const KEY = `${CELL} inline-flex h-(--nc-h-md) w-[36px] flex-none items-center justify-center text-ink-2`;

/**
 * Play, rewind and stop, as one row of joined keys.
 *
 * Not a tool group: that one is a radio group, where the choice persists and one option is always
 * current. Here the first key toggles between two states and the other two act and are over — a
 * transport has no selected member, so none of its keys latches.
 */
@Component({
  selector: 'nc-transport',
  imports: [IconComponent],
  templateUrl: './transport.component.html',
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransportComponent {
  readonly playing = input(false, { transform: booleanAttribute });
  readonly canRewind = input(true, { transform: booleanAttribute });
  readonly rewind = input(true, { transform: booleanAttribute });
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

  protected readonly first = `${KEY} ${joined(true, false)}`;
  protected readonly middle = `${KEY} ${joined(false, false)}`;
  protected readonly last = `${KEY} ${joined(false, true)}`;
}
