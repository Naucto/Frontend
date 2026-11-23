import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  KeycapComponent,
  LooksOnlyDirective,
  PopoverDirective,
  PopoverPanelComponent,
  TooltipDirective,
} from '@naucto/ui';

import type { SoundWindow } from '../sound.store';

/** A key held with a gesture (Shift and a click), a gesture alone, or keys pressed together. */
interface HelpEntry {
  keys?: readonly string[];
  gesture?: string;
  action: string;
}

/** What a window lists: what the pointer does, what the keys do, and the keys every window shares. */
interface Help {
  mouse: readonly HelpEntry[];
  keyboard: readonly HelpEntry[];
  shared: readonly HelpEntry[];
}

const UNDO: HelpEntry = { keys: ['Ctrl', 'Z'], action: 'undo' };
const REDO: HelpEntry = { keys: ['Ctrl', 'Shift', 'Z'], action: 'redo' };
const PLAY: HelpEntry = { keys: ['Space'], action: 'playPause' };

const ROLL: readonly HelpEntry[] = [
  { gesture: 'clickCell', action: 'placeNote' },
  { gesture: 'dragNote', action: 'moveNote' },
  { gesture: 'dragNoteEdge', action: 'resizeNote' },
  { gesture: 'rightClickNote', action: 'removeNote' },
  { gesture: 'clickRuler', action: 'moveHead' },
  { gesture: 'clickPastEnd', action: 'lengthen' },
  { gesture: 'dragEnd', action: 'setLength' },
  { gesture: 'pressKey', action: 'playKey' },
];

const HELP: Record<SoundWindow, Help> = {
  timeline: {
    mouse: [
      { gesture: 'dragPattern', action: 'placeBlock' },
      { gesture: 'dragBlock', action: 'moveBlock' },
      { gesture: 'dragBlockOut', action: 'removeBlock' },
      { gesture: 'dragBlockEdge', action: 'repeatBlock' },
      { gesture: 'doubleClickBlock', action: 'openPattern' },
      { keys: ['Shift'], gesture: 'clickBlock', action: 'addToSelection' },
      { gesture: 'clickRuler', action: 'moveHead' },
      { gesture: 'dragLoop', action: 'setLoop' },
    ],
    keyboard: [
      { keys: ['Enter'], action: 'insertAtHead' },
      { keys: ['Ctrl', 'D'], action: 'duplicate' },
      { keys: ['Ctrl', 'C'], action: 'copy' },
      { keys: ['Ctrl', 'V'], action: 'paste' },
      { keys: ['Delete'], action: 'removeSelection' },
      { keys: ['Esc'], action: 'clearSelection' },
    ],
    shared: [PLAY, UNDO, REDO],
  },
  patterns: { mouse: ROLL, keyboard: [], shared: [PLAY, UNDO, REDO] },
  sfx: {
    mouse: [{ gesture: 'clickChosen', action: 'renameIt' }, ...ROLL],
    keyboard: [],
    shared: [PLAY, UNDO, REDO],
  },
  instruments: {
    mouse: [
      { gesture: 'pressKey', action: 'playKey' },
      { gesture: 'dragKeys', action: 'playAlong' },
    ],
    keyboard: [],
    shared: [UNDO, REDO],
  },
};

@Component({
  selector: 'nc-sound-help',
  imports: [
    NgTemplateOutlet,
    TranslocoDirective,
    ButtonDirective,
    LooksOnlyDirective,
    KeycapComponent,
    PopoverDirective,
    PopoverPanelComponent,
    TooltipDirective,
  ],
  templateUrl: './sound-help.component.html',
  host: { class: 'flex shrink-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundHelpComponent {
  readonly editor = input.required<SoundWindow>();
  protected readonly help = computed(() => HELP[this.editor()]);
  protected readonly intro = computed(() => this.editor() === 'sfx');
}
