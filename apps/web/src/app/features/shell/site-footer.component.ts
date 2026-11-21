import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { LogoComponent, MarkComponent } from '@naucto/ui';

import { FeedbackLauncher } from '../../shared/feedback/feedback-launcher.service';

/** Hub/learn pages only — never rendered in the editor. */
@Component({
  selector: 'nc-site-footer',
  imports: [NgTemplateOutlet, RouterLink, TranslocoDirective, LogoComponent, MarkComponent],
  templateUrl: './site-footer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooterComponent {
  protected readonly feedback = inject(FeedbackLauncher);
  /** The group standing open below md, where only one is at a time; from md all three are. */
  protected readonly open = signal<'product' | 'community' | 'legal' | null>(null);
  protected readonly links = 'grid gap-[8px] max-md:gap-[10px] max-md:px-[16px] max-md:pb-[14px]';
  protected readonly link = 'cursor-pointer text-left text-body text-ink-2 hover:text-ink';
}
