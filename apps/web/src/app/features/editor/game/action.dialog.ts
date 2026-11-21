import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  ACTION_DESCRIPTION_MAX,
  ACTION_LABEL_MAX,
  ACTION_NAME_MAX,
  type EditableGame,
  type GameAction,
} from '@naucto/engine';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  IconComponent,
  InputDirective,
} from '@naucto/ui';

export interface ActionDialogData {
  game: EditableGame;
  /** The action to edit, or null to make one. */
  action: GameAction | null;
}

/** What the dialog was closed on: the id of the action it made, or the wish to remove the one it edits. */
export type ActionDialogResult = { added: string } | 'remove';

/**
 * What an action says of itself: the label and the description players read, and the name the
 * code reads it by. The same three fields make a new action and edit one there is.
 */
@Component({
  selector: 'nc-action-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    IconComponent,
    InputDirective,
  ],
  templateUrl: './action.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionDialog {
  protected readonly data = inject<ActionDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<ActionDialogResult>>(DialogRef);
  private readonly transloco = inject(TranslocoService);

  protected readonly LABEL_MAX = ACTION_LABEL_MAX;
  protected readonly NAME_MAX = ACTION_NAME_MAX;
  protected readonly DESCRIPTION_MAX = ACTION_DESCRIPTION_MAX;

  protected readonly label = signal(this.data.action?.label ?? '');
  protected readonly description = signal(this.data.action?.description ?? '');
  /** Null while the name follows the label: a new action's, until its author types one. */
  protected readonly typedName = signal<string | null>(this.data.action?.name ?? null);
  protected readonly name = computed(
    () =>
      this.typedName() ??
      this.label()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^[^a-z]+|_+$/g, '')
        .slice(0, ACTION_NAME_MAX),
  );
  protected readonly issue = computed(() =>
    this.data.game.actionNameIssue(this.name(), this.data.action?.id),
  );
  /** Said under the field once there is a name to fault: an empty one is only not yet typed. */
  protected readonly nameError = computed(() => {
    const issue = this.issue();
    return issue === null || issue === 'empty'
      ? undefined
      : this.transloco.translate(`editor.game.inputs.nameIssue.${issue}`, {
          max: ACTION_NAME_MAX,
        });
  });
  /** The name the code still reads the action by, once the field holds another. */
  protected readonly renamedFrom = computed(() => {
    const was = this.data.action?.name;
    return was !== undefined && was !== this.name() ? was : null;
  });

  protected submit(): void {
    if (this.issue() !== null) {
      return;
    }
    const fields = { name: this.name(), label: this.label(), description: this.description() };
    const action = this.data.action;
    if (action) {
      this.data.game.updateAction(action.id, fields);
      this.ref.close();
      return;
    }
    const added = this.data.game.addAction(fields);
    if (added !== null) {
      this.ref.close({ added });
    }
  }
}
