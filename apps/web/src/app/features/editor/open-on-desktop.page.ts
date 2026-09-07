import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, EmptyStateComponent, IconComponent, ToastService } from '@naucto/ui';

/**
 * Where `/edit/:id` lands on a phone. The editor is desktop-only for now, but a link to it is
 * still a link to a real game — this keeps it, rather than telling the person it does not exist.
 */
@Component({
  selector: 'nc-open-on-desktop-page',
  imports: [RouterLink, TranslocoDirective, ButtonDirective, EmptyStateComponent, IconComponent],
  template: `
    <div *transloco="let t" class="flex min-h-[70vh] items-center justify-center">
      <nc-empty-state icon="device-laptop" [title]="t('editor.desktopOnly.title')">
        <p hint class="max-w-[420px] text-meta leading-[1.6] text-ink-3">
          {{ t('editor.desktopOnly.hint') }}
        </p>
        @if (link(); as url) {
          <div class="flex w-full max-w-[420px] items-center gap-1">
            <span
              class="min-w-0 flex-1 truncate rounded-sm border border-line bg-inset px-1.5 py-1 font-mono text-meta text-ink-body"
            >
              {{ url }}
            </span>
            <button ncButton variant="secondary" (click)="copy(url)">
              {{ copied() ? t('editor.desktopOnly.copied') : t('editor.desktopOnly.copy') }}
            </button>
          </div>
        }
        <div class="flex flex-wrap justify-center gap-1">
          @if (id()) {
            <a ncButton variant="primary" [routerLink]="['/play', id()]">
              <nc-icon name="play" [size]="12" />
              {{ t('editor.desktopOnly.play') }}
            </a>
          }
          <a ncButton variant="secondary" routerLink="/hub">{{ t('editor.desktopOnly.hub') }}</a>
        </div>
      </nc-empty-state>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenOnDesktopPage {
  /** Bound from `?id=`, so the page can offer to play the game and hand back its editor link. */
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
