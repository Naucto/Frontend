import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { unwrap } from '@app/core/api/api-errors';
import { AuthStore } from '@app/core/auth/auth.store';
import { ThemeService } from '@app/core/theme/theme.service';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { userControllerUpdateMyProfile } from '@naucto/api-client';
import {
  ButtonDirective,
  FieldComponent,
  InputDirective,
  SectionComponent,
  ToastService,
  ToggleComponent,
} from '@naucto/ui';

@Component({
  selector: 'nc-account-settings',
  imports: [
    FormsModule,
    TranslocoDirective,
    ButtonDirective,
    FieldComponent,
    InputDirective,
    SectionComponent,
    ToggleComponent,
  ],
  template: `
    <div *transloco="let t" class="grid gap-3">
      <nc-section title="Display name">
        <div class="flex items-end gap-2">
          <nc-field label="Shown on your games and in sessions" for="nickname" class="flex-1">
            <input ncInput id="nickname" [(ngModel)]="nickname" maxlength="32" />
          </nc-field>
          <button ncButton variant="primary" (click)="save()" [disabled]="saving()">Save</button>
        </div>
      </nc-section>
      <nc-section title="Reduce motion">
        <nc-toggle
          [checked]="theme.reduceMotion()"
          (checkedChange)="theme.reduceMotion.set($event)"
        >
          Turns off scanlines and screen shake in the UI
        </nc-toggle>
      </nc-section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSettingsComponent {
  private readonly auth = inject(AuthStore);
  private readonly toasts = inject(ToastService);
  protected readonly theme = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);
  protected nickname = this.auth.user()?.nickname ?? '';
  protected readonly saving = signal(false);

  protected async save(): Promise<void> {
    this.saving.set(true);
    const previous = this.auth.user()?.nickname ?? '';
    try {
      unwrap(await userControllerUpdateMyProfile({ body: { nickname: this.nickname } }));
      await this.auth.refreshProfile();
      this.toasts.show(this.transloco.translate('settings.saved'), 'success');
    } catch {
      // Put the field back to what the server still has, and say so.
      this.nickname = previous;
      this.toasts.show(this.transloco.translate('settings.saveFailed'), 'error');
    } finally {
      this.saving.set(false);
    }
  }
}
