import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, EmptyStateComponent, IconComponent, ToastService } from '@naucto/ui';

/**
 * What stands in for the editor's workspace while the window is too narrow to lay it out.
 *
 * It offers the game and the link rather than an apology, because someone reaching this has
 * followed a link to something real and should leave with a way to it.
 */
@Component({
  selector: 'nc-open-on-desktop',
  imports: [RouterLink, TranslocoDirective, ButtonDirective, EmptyStateComponent, IconComponent],
  templateUrl: './open-on-desktop.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenOnDesktopComponent {
  readonly id = input('');
  private readonly toasts = inject(ToastService);
  protected readonly copied = signal(false);
  protected readonly link = computed(() =>
    this.id() ? `${location.origin}/edit/${this.id()}` : '',
  );

  protected copy(url: string): void {
    void navigator.clipboard.writeText(url).then(
      () => {
        this.copied.set(true);
        setTimeout(() => {
          this.copied.set(false);
        }, 2000);
      },
      () => {
        this.toasts.show('Could not copy', 'error');
      },
    );
  }
}
