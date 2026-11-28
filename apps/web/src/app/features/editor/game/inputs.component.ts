import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  type ActionInput,
  actionsUsing,
  type GameAction,
  INPUT_PRESET_IDS,
  INPUT_PRESETS,
  type InputPresetId,
  MAX_ACTIONS,
  type PadControl,
  TOUCH_CONTROLS,
  touchControlsOf,
  touchUnreachable,
} from '@naucto/engine';
import {
  ButtonDirective,
  ChangeChipComponent,
  ChipComponent,
  closedBy,
  DialogService,
  HelpDotComponent,
  IconComponent,
  KeycapComponent,
  LabelComponent,
  LooksOnlyDirective,
  MarkComponent,
  TableDirective,
} from '@naucto/ui';

import { VirtualPadComponent } from '../../../shared/game-screen/virtual-pad.component';
import { BindingCaptureService } from '../../../shared/input/binding-capture.service';
import { InputCapComponent } from '../../../shared/input/input-cap.component';
import { legendOf } from '../../../shared/input/input-legend';
import { ySignal } from '../../../shared/yjs/y-signal';
import { DiffStore } from '../diff/diff.store';
import { DiffChangesComponent } from '../diff/diff-changes.component';
import { WorkSessionService } from '../work-session/work-session.service';
import type { ActionDialogData, ActionDialogResult } from './action.dialog';

/** What stands under the head of the tab: the actions, the on-screen pad they give, or the presets. */
type Pane = 'actions' | 'touch' | 'presets';

/** An input somebody asked to plug into an action while other actions already hold it. */
interface Clash {
  actionId: string;
  input: ActionInput;
  /** The other actions it is plugged into, as one line. */
  into: string;
  others: readonly GameAction[];
  /** The input this one takes the place of, for a key handed to the other player. */
  replaces: ActionInput | null;
}

const PRESETS = INPUT_PRESET_IDS.map((id) => ({ id, actions: INPUT_PRESETS[id] }));

/** An open action and the rows under it stand on one ground, marked along their left edge. */
const OPEN_ROW = 'bg-raised! shadow-[inset_3px_0_0_var(--color-primary)]';

/**
 * The Inputs tab: the game's actions as one table, each a row that opens onto the inputs plugged
 * into it, a keyboard key or a gamepad control. The on-screen pad is not set here: it is drawn
 * from the gamepad controls the actions use, and shown as players will get it.
 */
@Component({
  selector: 'nc-game-inputs',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    ChangeChipComponent,
    ChipComponent,
    DiffChangesComponent,
    HelpDotComponent,
    IconComponent,
    InputCapComponent,
    KeycapComponent,
    LabelComponent,
    LooksOnlyDirective,
    MarkComponent,
    TableDirective,
    VirtualPadComponent,
  ],
  providers: [BindingCaptureService],
  templateUrl: './inputs.component.html',
  host: { class: '@container block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InputsComponent {
  protected readonly MAX_ACTIONS = MAX_ACTIONS;
  protected readonly TOUCH_SLOTS = TOUCH_CONTROLS.length;
  protected readonly PRESETS = PRESETS;
  protected readonly OPEN_ROW = OPEN_ROW;
  protected readonly capture = inject(BindingCaptureService);
  /**
   * The preset tiles and the rows that are dragged are drawn here and not by the kit, so they
   * ask the scope themselves.
   */
  protected readonly closed = closedBy(() => false);
  private readonly session = inject(WorkSessionService);
  private readonly dialogs = inject(DialogService);
  private readonly transloco = inject(TranslocoService);
  private readonly changes = inject(ChangeDetectorRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly diff = inject(DiffStore);
  private readonly held = ySignal(
    () => this.session.game.actions,
    (cb) => this.session.game.onActionsChange(cb),
  );
  /** The project's actions, or what they would be with the changes not refused. */
  protected readonly actions = computed(() => {
    const held = this.held();
    this.diff.decisions();
    const shown = this.diff.shown();
    return shown === this.session.game ? held : shown.actions;
  });
  protected readonly changeList = computed(() => this.diff.itemsOf('game'));
  /** How each action differs while diff mode is on. */
  protected readonly kinds = computed(
    () =>
      new Map(
        this.changeList().flatMap((item) =>
          item.type === 'action' ? [[item.id, item.kind] as const] : [],
        ),
      ),
  );
  protected readonly pane = signal<Pane>('actions');
  protected readonly openId = signal<string | null>(null);
  /** The action waiting for a key or a gamepad control to be plugged into it. */
  protected readonly listeningFor = signal<string | null>(null);
  protected readonly clash = signal<Clash | null>(null);
  protected readonly touch = computed(() => touchControlsOf(this.actions()));
  protected readonly offPad = computed(() => touchUnreachable(this.actions()));
  /** The action being dragged, and the one it would take the place of. */
  private readonly dragged = signal<string | null>(null);
  private readonly over = signal<string | null>(null);

  protected rowClass(action: GameAction, i: number): string {
    if (action.id === this.openId()) {
      return OPEN_ROW;
    }
    if (action.id !== this.over() || action.id === this.dragged()) {
      return '';
    }
    const from = this.actions().findIndex((other) => other.id === this.dragged());
    return from < i
      ? 'shadow-[inset_0_-3px_0_var(--color-primary)]'
      : 'shadow-[inset_0_3px_0_var(--color-primary)]';
  }

  /** What a gamepad control is called on the pad itself. */
  protected padName(control: PadControl): string {
    const legend = legendOf({ kind: 'pad', control });
    return legend.text ?? this.transloco.translate(legend.word ?? '');
  }

  /** Lets go of a capture and of a question about one, for whoever turns away from the open action. */
  private callOff(): void {
    this.listeningFor.set(null);
    this.capture.cancel();
    this.clash.set(null);
  }

  protected togglePane(pane: Pane): void {
    this.callOff();
    this.pane.set(this.pane() === pane ? 'actions' : pane);
  }

  protected toggle(id: string): void {
    this.callOff();
    this.openId.set(this.openId() === id ? null : id);
  }

  /**
   * Puts the focus on what the open action offers next, once it is drawn: the button that had it
   * went away with the capture or the question it started.
   */
  protected refocus(): void {
    this.changes.detectChanges();
    this.host.querySelector<HTMLElement>('[data-next]')?.focus();
  }

  /** Plugs the input a clash was about; `move` takes it out of the actions that held it. */
  protected settle(clash: Clash, move: boolean): void {
    const game = this.session.game;
    game.transact(() => {
      if (clash.replaces) {
        game.unplugInput(clash.actionId, clash.replaces);
      }
      if (move) {
        for (const other of clash.others) {
          game.unplugInput(other.id, clash.input);
        }
      }
      game.plugInput(clash.actionId, clash.input);
    });
    this.clash.set(null);
    this.refocus();
  }

  /** Plugs an input into an action, asking first when other actions already hold it. */
  private offer(action: GameAction, input: ActionInput, replaces: ActionInput | null): void {
    const others = actionsUsing(this.actions(), input, action.id);
    const clash: Clash = {
      actionId: action.id,
      input,
      into: new Intl.ListFormat(this.transloco.getActiveLang(), { type: 'conjunction' }).format(
        others.map((other) => other.label || other.name),
      ),
      others,
      replaces,
    };
    if (others.length) {
      this.clash.set(clash);
      this.refocus();
    } else {
      this.settle(clash, false);
    }
  }

  protected async plug(action: GameAction): Promise<void> {
    this.clash.set(null);
    this.listeningFor.set(action.id);
    const input = await this.capture.listen();
    // Called off by turning away: the focus is where that click or key put it.
    if (this.listeningFor() !== action.id) {
      return;
    }
    this.listeningFor.set(null);
    if (input) {
      this.offer(action, input, null);
    } else {
      this.refocus();
    }
  }

  /** Hands a key to the other player's keyboard. */
  protected switchPlayer(action: GameAction, key: ActionInput & { kind: 'key' }): void {
    this.offer(action, { ...key, player: key.player === 0 ? 1 : 0 }, key);
  }

  protected unplug(action: GameAction, input: ActionInput): void {
    this.session.game.unplugInput(action.id, input);
  }

  protected async remove(action: GameAction): Promise<void> {
    const confirmed = await this.dialogs.confirmDanger({
      title: this.transloco.translate('editor.game.inputs.removeTitle', {
        action: action.label || action.name,
      }),
      message: this.transloco.translate('editor.game.inputs.removeHint', { name: action.name }),
      confirmLabel: this.transloco.translate('editor.game.inputs.remove'),
    });
    if (confirmed) {
      this.session.game.removeAction(action.id);
    }
  }

  /** Opens the dialog that edits an action, or makes one when there is none to edit. */
  protected async edit(action: GameAction | null): Promise<void> {
    const { ActionDialog } = await import('./action.dialog');
    this.dialogs
      .open<unknown, ActionDialogData, ActionDialogResult>(ActionDialog, {
        data: { game: this.session.game, action },
        ariaLabel: this.transloco.translate(
          action ? 'editor.game.inputs.editAction' : 'editor.game.inputs.addAction',
        ),
      })
      .closed.subscribe((result) => {
        if (result === 'remove' && action) {
          void this.remove(action);
        } else if (result && result !== 'remove') {
          this.pane.set('actions');
          this.openId.set(result.added);
        }
      });
  }

  /** Puts an action where another one is, the ones between moving up or down by one. */
  private move(id: string, to: number): void {
    const ids = this.actions().map((action) => action.id);
    const from = ids.indexOf(id);
    if (from < 0 || to < 0 || to >= ids.length || from === to) {
      return;
    }
    ids.splice(to, 0, ...ids.splice(from, 1));
    this.session.game.reorderActions(ids);
  }

  /**
   * Alt with an arrow moves the action. The rows are redrawn before the handler returns, and the
   * focus put back on the one that moved: a row loses it when it is moved, and the next press of
   * a held key would otherwise land on the page.
   */
  protected onRowKey(event: KeyboardEvent, action: GameAction, i: number): void {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || this.closed()) {
      return;
    }
    event.preventDefault();
    this.move(action.id, event.key === 'ArrowUp' ? i - 1 : i + 1);
    this.changes.detectChanges();
    this.host
      .querySelector<HTMLElement>(`[data-action="${CSS.escape(action.id)}"] button`)
      ?.focus();
  }

  protected dragStart(event: DragEvent, action: GameAction): void {
    this.dragged.set(action.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', action.name);
    }
  }

  /** Only a dragged action is taken: a file or a selection dropped on a row is not one. */
  protected dragOver(event: DragEvent, action: GameAction): void {
    if (this.dragged() !== null) {
      event.preventDefault();
      this.over.set(action.id);
    }
  }

  protected dragEnd(): void {
    this.dragged.set(null);
    this.over.set(null);
  }

  protected drop(event: DragEvent, i: number): void {
    const id = this.dragged();
    if (id !== null) {
      event.preventDefault();
      this.move(id, i);
    }
    this.dragEnd();
  }

  protected async applyPreset(preset: InputPresetId): Promise<void> {
    // Named first: as an argument its type would be inferred from the untyped parameter bag.
    const name = this.transloco.translate(`editor.game.preset.${preset}`);
    const confirmed = await this.dialogs.confirm({
      title: this.transloco.translate('editor.game.presetConfirmTitle', { preset: name }),
      message: this.transloco.translate('editor.game.presetConfirmHint'),
      confirmLabel: this.transloco.translate('editor.game.presetConfirm'),
    });
    if (confirmed) {
      this.session.game.applyPreset(preset);
      this.openId.set(null);
      this.pane.set('actions');
    }
  }
}
