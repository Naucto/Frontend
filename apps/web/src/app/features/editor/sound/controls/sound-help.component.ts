import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  KeycapComponent,
  PopoverDirective,
  PopoverPanelComponent,
} from '@naucto/ui';

import type { SoundWindow } from '../sound.store';

export interface HelpEntry {
  keys?: readonly (readonly string[])[];
  gesture?: string;
  action: string;
}

const UNDO: HelpEntry = { keys: [['Ctrl', 'Z']], action: 'undo' };
const REDO: HelpEntry = { keys: [['Ctrl', 'Shift', 'Z']], action: 'redo' };
const PLAY: HelpEntry = { keys: [['Space']], action: 'playPause' };

const ROLL: readonly HelpEntry[] = [
  { gesture: 'clickCell', action: 'placeNote' },
  { gesture: 'dragNote', action: 'moveNote' },
  { gesture: 'dragNoteEdge', action: 'resizeNote' },
  { gesture: 'rightClickNote', action: 'removeNote' },
  { gesture: 'clickRuler', action: 'moveHead' },
  { gesture: 'clickPastEnd', action: 'lengthen' },
  { gesture: 'dragEnd', action: 'setLength' },
  { gesture: 'pressKey', action: 'playKey' },
  PLAY,
  UNDO,
  REDO,
];

const HELP: Record<SoundWindow, readonly HelpEntry[]> = {
  timeline: [
    { gesture: 'dragPattern', action: 'placeBlock' },
    { gesture: 'dragBlock', action: 'moveBlock' },
    { gesture: 'dragBlockOut', action: 'removeBlock' },
    { gesture: 'dragBlockEdge', action: 'repeatBlock' },
    { gesture: 'doubleClickBlock', action: 'openPattern' },
    { gesture: 'shiftClick', action: 'addToSelection' },
    { gesture: 'clickRuler', action: 'moveHead' },
    { gesture: 'dragLoop', action: 'setLoop' },
    { keys: [['Enter']], action: 'insertAtHead' },
    { keys: [['Ctrl', 'D']], action: 'duplicate' },
    {
      keys: [
        ['Ctrl', 'C'],
        ['Ctrl', 'V'],
      ],
      action: 'copyPaste',
    },
    { keys: [['Delete']], action: 'removeSelection' },
    { keys: [['Esc']], action: 'clearSelection' },
    PLAY,
    UNDO,
    REDO,
  ],
  patterns: ROLL,
  sfx: [{ gesture: 'clickChosen', action: 'renameIt' }, ...ROLL],
  instruments: [
    { gesture: 'pressKey', action: 'playKey' },
    { gesture: 'dragKeys', action: 'playAlong' },
    UNDO,
    REDO,
  ],
};

@Component({
  selector: 'nc-sound-help',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    KeycapComponent,
    PopoverDirective,
    PopoverPanelComponent,
  ],
  templateUrl: './sound-help.component.html',
  host: { class: 'flex shrink-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundHelpComponent {
  readonly editor = input.required<SoundWindow>();
  protected readonly entries = computed(() => HELP[this.editor()]);
  protected readonly intro = computed(() => this.editor() === 'sfx');
}
