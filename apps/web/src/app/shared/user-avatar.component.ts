import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type AvatarColour, AvatarComponent } from '@naucto/ui';

import { injectUserAvatar } from './queries/user.queries';

@Component({
  selector: 'nc-user-avatar',
  imports: [AvatarComponent],
  templateUrl: './user-avatar.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAvatarComponent {
  readonly userId = input<number | null>(null);
  readonly name = input.required<string>();
  readonly colour = input<AvatarColour>();
  readonly size = input(24);
  readonly overlap = input(false, { transform: booleanAttribute });
  readonly avatarClass = input('');

  protected readonly avatar = injectUserAvatar(() => this.userId());
}
