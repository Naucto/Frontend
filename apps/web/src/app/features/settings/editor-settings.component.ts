import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EditorPrefsStore } from '@app/core/prefs/editor-prefs.store';
import { TranslocoDirective } from '@jsverse/transloco';
import { SettingRowComponent, ToggleComponent } from '@naucto/ui';

/** EDITOR tab: defaults the editor starts with. */
@Component({
  selector: 'nc-editor-settings',
  imports: [TranslocoDirective, SettingRowComponent, ToggleComponent],
  template: `
    <div *transloco="let t">
      <nc-setting-row [title]="t('settings.autoRun')" [hint]="t('settings.autoRunDefault')">
        <nc-toggle
          [checked]="prefs.autoRun()"
          (checkedChange)="prefs.setAutoRun($event)"
          [label]="t('settings.autoRun')"
        />
      </nc-setting-row>
      <nc-setting-row [title]="t('settings.snap')" [hint]="t('settings.snapHint')">
        <nc-toggle
          [checked]="prefs.soundSnap()"
          (checkedChange)="prefs.setSoundSnap($event)"
          [label]="t('settings.snap')"
        />
      </nc-setting-row>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorSettingsComponent {
  protected readonly prefs = inject(EditorPrefsStore);
}
