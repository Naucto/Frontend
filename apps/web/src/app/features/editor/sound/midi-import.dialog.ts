import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { type MidiSong, midiToSong, type ParsedMidi, readMidi, VOICES } from '@naucto/engine';
import {
  ButtonDirective,
  CheckboxComponent,
  ChipComponent,
  DialogShellComponent,
  MarkComponent,
  NoticeComponent,
  NumberFieldComponent,
  StatComponent,
} from '@naucto/ui';

import { BPM_MAX, BPM_MIN } from './editors/note-sheet-editor.component';

export interface MidiImportDialogData {
  /** The first pattern number past those taken. */
  firstSlot: number;
}

/** The voices a music leaves the sound effects, which the import keeps as a new music does. */
const SFX_VOICES = 1;
/** A file larger than this is no MIDI file anyone wrote by hand or exported from a sequencer. */
const MAX_FILE_BYTES = 256 * 1024;

/**
 * A MIDI file into a new music: its tracks listed, the ones to keep chosen (one music track each,
 * as many as there are voices for), its tempo set, and what the import keeps and drops said before
 * anything is written. Nothing here writes the document: the music comes back as the result.
 */
@Component({
  selector: 'nc-midi-import-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    CheckboxComponent,
    ChipComponent,
    DialogShellComponent,
    MarkComponent,
    NoticeComponent,
    NumberFieldComponent,
    StatComponent,
  ],
  templateUrl: './midi-import.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MidiImportDialog {
  protected readonly ref = inject<DialogRef<MidiSong | undefined>>(DialogRef);
  private readonly data = inject<MidiImportDialogData>(DIALOG_DATA);
  protected readonly BPM_MIN = BPM_MIN;
  protected readonly BPM_MAX = BPM_MAX;
  /** One track of the music each, and a voice left for the sound effects. */
  protected readonly maxTracks = VOICES - SFX_VOICES;

  protected readonly fileName = signal('');
  protected readonly parsed = signal<ParsedMidi | null>(null);
  protected readonly readError = signal<string | null>(null);
  protected readonly chosen = signal<ReadonlySet<number>>(new Set());
  protected readonly bpm = signal<number | null>(null);

  /** The file's tracks that hold notes: a track of names or tempo alone has nothing to import. */
  protected readonly tracks = computed(
    () => this.parsed()?.tracks.filter((track) => track.notes.length > 0) ?? [],
  );

  /** The music the choices make, worked out again on every change, or why there is none. */
  protected readonly result = computed<{ music: MidiSong } | { error: string } | null>(() => {
    const parsed = this.parsed();
    if (!parsed || this.chosen().size === 0) {
      return null;
    }
    try {
      return {
        music: midiToSong(parsed, {
          name: this.fileName()
            .replace(/\.midi?$/i, '')
            .slice(0, 24),
          tracks: this.tracks()
            .map((track) => track.index)
            .filter((index) => this.chosen().has(index)),
          sfxVoices: SFX_VOICES,
          firstSlot: this.data.firstSlot,
          prefix: `midi${Date.now().toString(36)}`,
          ...(this.bpm() === null ? {} : { bpm: this.bpm() ?? undefined }),
        }),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  protected readonly music = computed(() => {
    const result = this.result();
    return result && 'music' in result ? result.music : null;
  });

  protected readonly totals = computed(() => {
    const reports = this.music()?.reports ?? [];
    return {
      patterns: this.music()?.patterns.length ?? 0,
      kept: reports.reduce((sum, report) => sum + report.importedNotes, 0),
      dropped: reports.reduce((sum, report) => sum + report.droppedNotes, 0),
      warnings: [...new Set(reports.flatMap((report) => report.warnings))],
    };
  });

  protected async read(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.fileName.set(file.name);
    this.parsed.set(null);
    this.readError.set(null);
    try {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error('too large');
      }
      const parsed = readMidi(new Uint8Array(await file.arrayBuffer()));
      this.parsed.set(parsed);
      this.bpm.set(Math.round(parsed.steadyBpm ?? parsed.bpm));
      // The first tracks the voices allow, melody first as files usually put it.
      this.chosen.set(
        new Set(
          this.tracks()
            .slice(0, this.maxTracks)
            .map((track) => track.index),
        ),
      );
    } catch {
      this.readError.set(file.name);
    }
  }

  protected toggle(index: number, on: boolean): void {
    const next = new Set(this.chosen());
    if (on) {
      next.add(index);
    } else {
      next.delete(index);
    }
    this.chosen.set(next);
  }

  protected setBpm(value: number): void {
    this.bpm.set(Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(value))));
  }
}
