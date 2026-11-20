import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent, type IconName } from '@naucto/ui';

/** What the card offers once it is reached; `none` offers nothing. */
export type CoverCardAction = 'play' | 'edit' | 'new' | 'none';

const ACTION_ICON: Record<CoverCardAction, IconName> = {
  play: 'play',
  edit: 'edit',
  new: 'plus',
  none: 'plus',
};

/** The shape of a game's cover, as CSS `aspect-ratio`. */
export const COVER_RATIO = '16 / 9';

/**
 * A game as its cover in a flat frame, its name under it. Reached by the pointer or the keyboard,
 * the frame lifts and lights and the action shows over the cover.
 *
 * The box is the card's; what fills it is the caller's. Project `[cover]` into the box, `[info]`
 * into the strip along its bottom and `[meta]` under the name. Without a `link` the card is a
 * still picture, which is what a shelf's empty cells are made of.
 */
@Component({
  selector: 'nc-cover-card',
  imports: [RouterLink, IconComponent],
  templateUrl: './cover-card.component.html',
  host: { class: '@container block min-w-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoverCardComponent {
  readonly name = input.required<string>();
  readonly link = input<string | unknown[] | null>(null);
  readonly action = input<CoverCardAction>('none');
  readonly actionLabel = input('');
  /** The game that does not exist yet: an empty frame whose action always shows. */
  readonly ghost = input(false, { transform: booleanAttribute });

  protected readonly ACTION_ICON = ACTION_ICON;
  protected readonly COVER_RATIO = COVER_RATIO;
}
