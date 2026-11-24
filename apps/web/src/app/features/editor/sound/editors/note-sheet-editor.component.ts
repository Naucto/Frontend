import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { type Note, type Pattern } from '@naucto/engine';
import {
  ButtonDirective,
  EdgeHandleComponent,
  EmptyStateComponent,
  IconComponent,
  type IconName,
  LooksOnlyDirective,
  MarkComponent,
  NumberFieldComponent,
  ToggleButtonComponent,
  TooltipDirective,
  TransportComponent,
} from '@naucto/ui';

import { MetronomeButtonComponent } from '../controls/metronome-button.component';
import { SoundHelpComponent } from '../controls/sound-help.component';
import { SoundZoomComponent } from '../controls/sound-zoom.component';
import { InstrumentListComponent } from '../instrument-list.component';
import { OscilloscopeComponent } from '../oscilloscope.component';
import { PianoRollComponent } from '../piano-roll.component';
import { MAX_ZOOM, MIN_ZOOM, SNAP_DIVISIONS, type SnapDivision } from '../sound.store';
import { SoundDeck } from '../sound-deck';
import { SoundPeersComponent } from '../sound-peers.component';
import { VoicesLaneComponent } from '../voices-lane.component';

export const BPM_MIN = 40;
export const BPM_MAX = 240;

@Component({
  selector: 'nc-note-sheet-editor',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    EdgeHandleComponent,
    EmptyStateComponent,
    IconComponent,
    NumberFieldComponent,
    ToggleButtonComponent,
    TransportComponent,
    InstrumentListComponent,
    OscilloscopeComponent,
    PianoRollComponent,
    VoicesLaneComponent,
    SoundPeersComponent,
    SoundHelpComponent,
    MetronomeButtonComponent,
    SoundZoomComponent,
    LooksOnlyDirective,
    MarkComponent,
    TooltipDirective,
  ],
  templateUrl: './note-sheet-editor.component.html',
  host: { class: 'relative flex h-full min-h-0', '(keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NoteSheetEditorComponent {
  readonly source = input.required<'patterns' | 'sfx'>();
  readonly sheet = input.required<Pattern>();
  readonly loop = input(false);
  readonly clearLabel = input.required<string>();
  readonly emptyTitle = input.required<string>();
  readonly emptyIcon = input.required<IconName>();
  readonly showVoices = input(true);
  readonly notesChange = output<Note[]>();
  readonly bpmChange = output<number>();
  readonly stepsChange = output<number>();
  readonly loopChange = output<boolean>();
  readonly cleared = output();

  protected readonly deck = inject(SoundDeck);
  protected readonly store = this.deck.store;
  protected readonly BPM_MIN = BPM_MIN;
  protected readonly BPM_MAX = BPM_MAX;

  protected readonly playing = computed(() => this.deck.playing() === this.source());
  protected readonly head = computed(() => this.deck.heads[this.source()]());
  protected readonly folded = computed(() => this.store.folded().includes(this.source()));
  protected readonly zoom = computed(() =>
    this.source() === 'sfx' ? this.store.sfxZoom() : this.store.zoom(),
  );
  protected readonly MIN_ZOOM = MIN_ZOOM;
  protected readonly MAX_ZOOM = MAX_ZOOM;

  constructor() {
    effect(() => {
      const sheet = this.sheet();
      untracked(() => {
        this.deck.refreshSheet(this.source(), sheet);
      });
    });
  }

  protected play(): void {
    void this.deck.playSheet(this.source(), this.sheet(), this.loop());
  }

  protected setLoop(loop: boolean): void {
    this.loopChange.emit(loop);
    this.deck.setLoop(this.source(), loop);
  }

  protected onSeek(step: number): void {
    if (this.playing()) {
      this.deck.pause();
    }
    this.deck.heads[this.source()].set(step);
  }

  protected snapLabel(off: string): string {
    const snap = this.store.snap();
    return snap === 0 ? off : `1/${String(snap)}`;
  }

  protected cycleSnap(): void {
    const order: SnapDivision[] = [0, ...SNAP_DIVISIONS];
    const i = order.indexOf(this.store.snap());
    this.store.setSnap(order[(i + 1) % order.length] ?? 0);
  }

  protected setZoom(zoom: number): void {
    if (this.source() === 'sfx') {
      this.store.setSfxZoom(zoom);
    } else {
      this.store.setZoom(zoom);
    }
  }

  protected onPointer(pointer: { x: number; y: number } | null): void {
    this.deck.presence.setCursor(
      pointer
        ? {
            tab: `sound:${this.source()}`,
            scope: this.sheet().id,
            x: Math.round(pointer.x * 100) / 100,
            y: Math.round(pointer.y * 100) / 100,
          }
        : null,
    );
  }

  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (event.key !== ' ' || target?.tagName === 'INPUT' || target?.closest('button')) {
      return;
    }
    event.preventDefault();
    if (this.playing()) {
      this.deck.pause();
    } else {
      this.play();
    }
  }
}
