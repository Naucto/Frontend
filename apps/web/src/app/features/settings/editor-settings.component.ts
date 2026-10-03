import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EditorPrefsStore } from '@app/core/prefs/editor-prefs.store';
import { TranslocoDirective } from '@jsverse/transloco';
import { SettingRowComponent, ToggleComponent } from '@naucto/ui';

/** EDITOR tab: defaults the editor starts with. */
@Component({
  selector: 'nc-editor-settings',
  imports: [TranslocoDirective, SettingRowComponent, ToggleComponent],
  templateUrl: './editor-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorSettingsComponent {
  protected readonly prefs = inject(EditorPrefsStore);
}
