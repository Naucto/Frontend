import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { injectUserAvatar } from '@app/shared/queries/user.queries';
import { type AvatarColour, AvatarComponent } from '@naucto/ui';

@Component({
  selector: 'nc-user-avatar',
  imports: [AvatarComponent],
  template: `
    <nc-avatar
      [class]="avatarClass()"
      [name]="name()"
      [src]="avatar.data() ?? null"
      [id]="userId() ?? name()"
      [colour]="colour()"
      [size]="size()"
      [overlap]="overlap()"
    />
  `,
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAvatarComponent {
  readonly userId = input<number | null>(null);
  readonly name = input.required<string>();
  readonly colour = input<AvatarColour>();
  readonly size = input(24);
  readonly overlap = input(false, { transform: booleanAttribute });
  /**
   * Layout classes for the avatar itself. This host is `display: contents`, so a class written on
   * the element would have nothing to act on.
   */
  readonly avatarClass = input('');

  protected readonly avatar = injectUserAvatar(() => this.userId());
}
