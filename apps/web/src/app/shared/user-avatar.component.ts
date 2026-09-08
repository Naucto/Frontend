import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { injectUserAvatar } from '@app/shared/queries/user.queries';
import { type AvatarColour, AvatarComponent } from '@naucto/ui';

/**
 * An avatar for a person the page knows only by id.
 *
 * The kit's avatar is given a picture; finding one is the application's business, and the profile
 * is where a picture lives. This is the seam between the two — everywhere a listing names a person
 * without carrying their picture.
 */
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
   * Layout classes for the avatar itself. This host is `display: contents` — so that an overlapping
   * stack and a flex row see the avatar and not a wrapper — which also means a class written on
   * this element would have nothing to act on. It goes here instead.
   */
  readonly avatarClass = input('');

  protected readonly avatar = injectUserAvatar(() => this.userId());
}
