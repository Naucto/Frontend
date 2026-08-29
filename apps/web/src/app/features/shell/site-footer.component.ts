import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeService } from '@app/core/theme/theme.service';
import { TranslocoDirective } from '@jsverse/transloco';
import { ENGINE_VERSION } from '@naucto/engine/version';
import { IconComponent } from '@naucto/ui';

/** Hub/learn pages only — never rendered in the editor. */
@Component({
  selector: 'nc-site-footer',
  imports: [RouterLink, TranslocoDirective, IconComponent],
  template: `
    <footer *transloco="let t" class="mt-6 border-t border-line bg-panel">
      <div
        class="mx-auto grid w-full max-w-[1400px] grid-cols-2 gap-4 px-3 py-5 md:grid-cols-[1.4fr_1fr_1fr_1fr]"
      >
        <div>
          <div class="flex items-center gap-1">
            <img src="/img/logo.png" alt="" width="24" height="24" />
            <span class="text-title text-ink">Naucto</span>
          </div>
          <p class="mt-1 max-w-[38ch] text-body text-ink-2">{{ t('footer.tagline') }}</p>
        </div>
        <nav [attr.aria-label]="t('footer.product')">
          <div class="label mb-1">{{ t('footer.product') }}</div>
          <ul class="space-y-0.5 text-body">
            <li>
              <a routerLink="/hub" class="text-ink-2 hover:text-ink">{{ t('nav.hub') }}</a>
            </li>
            <li>
              <a routerLink="/learn" class="text-ink-2 hover:text-ink">{{ t('nav.learn') }}</a>
            </li>
            <li>
              <a routerLink="/games/new" class="text-ink-2 hover:text-ink">
                {{ t('footer.makeGame') }}
              </a>
            </li>
          </ul>
        </nav>
        <nav [attr.aria-label]="t('footer.community')">
          <div class="label mb-1">{{ t('footer.community') }}</div>
          <ul class="space-y-0.5 text-body">
            <li>
              <a routerLink="/friends" class="text-ink-2 hover:text-ink">{{ t('nav.friends') }}</a>
            </li>
            <li>
              <a
                href="https://github.com/Naucto"
                target="_blank"
                rel="noopener"
                class="inline-flex items-center gap-0.5 text-ink-2 hover:text-ink"
              >
                <nc-icon name="github" [size]="12" />
                GitHub
              </a>
            </li>
            <li>
              <a
                href="https://forms.gle/naucto-feedback"
                target="_blank"
                rel="noopener"
                class="text-ink-2 hover:text-ink"
              >
                {{ t('footer.feedback') }}
              </a>
            </li>
          </ul>
        </nav>
        <nav [attr.aria-label]="t('footer.legal')">
          <div class="label mb-1">{{ t('footer.legal') }}</div>
          <ul class="space-y-0.5 text-body">
            <li>
              <a
                href="https://github.com/Naucto/Frontend/blob/main/license.txt"
                target="_blank"
                rel="noopener"
                class="text-ink-2 hover:text-ink"
              >
                GPL-3.0
              </a>
            </li>
            <li>
              <a routerLink="/settings/account" class="text-ink-2 hover:text-ink">
                {{ t('footer.privacy') }}
              </a>
            </li>
            <li>
              <a
                href="https://github.com/Naucto/Frontend/security"
                target="_blank"
                rel="noopener"
                class="text-ink-2 hover:text-ink"
              >
                {{ t('footer.security') }}
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div class="border-t border-line">
        <div
          class="mx-auto flex w-full max-w-[1400px] items-center justify-between px-3 py-1.5 text-label text-ink-4"
        >
          <span>Naucto · engine {{ engineVersion }}</span>
          <button
            type="button"
            class="inline-flex items-center gap-0.5 hover:text-ink"
            (click)="theme.toggle()"
          >
            <nc-icon [name]="theme.theme() === 'light' ? 'moon' : 'sun'" [size]="12" />
            {{ t('footer.toggleTheme') }}
          </button>
        </div>
      </div>
    </footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooterComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly engineVersion = ENGINE_VERSION;
}
