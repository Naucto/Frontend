import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { UserAvatarComponent } from '../user-avatar.component';

/**
 * A comment as the game page draws it: the author's avatar, then a bubble whose tail points at it,
 * holding the name, what is projected as `meta` beside it, the body, and `actions` under it.
 * Without a `username` nothing links to the profile, as in a dialog that must not navigate away.
 */
@Component({
  selector: 'nc-comment-bubble',
  imports: [RouterLink, UserAvatarComponent],
  templateUrl: './comment-bubble.component.html',
  styleUrl: './speech-tail.css',
  host: { class: 'flex items-start gap-[18px]' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommentBubbleComponent {
  readonly authorId = input.required<number>();
  readonly name = input.required<string>();
  readonly username = input<string>();
  readonly creator = input(false);
  readonly avatarSize = input(40);
}
