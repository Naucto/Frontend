import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { type Note, type Pattern, stepsAfterEdit } from '@naucto/engine';
import { type PresenceDot } from '@naucto/ui';

import { type PickerItem, SoundPickerComponent } from '../controls/sound-picker.component';
import { SoundDeck } from '../sound-deck';
import { blankPattern, pad2, patternLabel, patternTint } from '../sound-library';
import { NoteSheetEditorComponent } from './note-sheet-editor.component';

@Component({
  selector: 'nc-pattern-editor',
  imports: [TranslocoDirective, NoteSheetEditorComponent, SoundPickerComponent],
  templateUrl: './pattern-editor.component.html',
  host: { class: 'block h-full' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatternEditorComponent {
  protected readonly deck = inject(SoundDeck);
  protected readonly store = this.deck.store;
  private readonly library = this.deck.library;
  private readonly blanks = new Map<number, Pattern>();
  protected readonly pad = pad2;

  protected readonly patterns = computed(() =>
    [...this.library.patterns().values()].sort((a, b) => a.slot - b.slot),
  );
  protected readonly pattern = computed<Pattern>(() => {
    const slot = this.store.patternSlot();
    return this.patterns().find((each) => each.slot === slot) ?? this.blankAt(slot);
  });

  protected tint(pattern: Pattern): string {
    return this.deck.palette()[patternTint(pattern, this.library.instruments())] ?? '';
  }

  private blankAt(slot: number): Pattern {
    const held = this.blanks.get(slot);
    if (held) {
      return held;
    }
    const made = blankPattern(slot);
    this.blanks.set(slot, made);
    return made;
  }

  private write(patch: Partial<Pattern>): void {
    const pattern = this.pattern();
    if (this.library.patterns().has(pattern.id)) {
      this.library.updatePattern(pattern.id, patch);
    } else {
      this.library.putPattern({ ...pattern, ...patch });
    }
  }

  protected setNotes(notes: Note[]): void {
    const pattern = this.pattern();
    if (this.library.patterns().has(pattern.id)) {
      this.library.setPatternNotes(pattern.id, notes);
    } else {
      this.library.putPattern({ ...pattern, notes, steps: stepsAfterEdit(pattern, notes) });
    }
  }

  protected setBpm(bpm: number): void {
    this.write({ bpm });
  }

  protected setLoop(loop: boolean): void {
    this.store.setLoop(loop);
  }

  protected async setSteps(steps: number): Promise<void> {
    const pattern = this.pattern();
    const kept = await this.deck.notesWithin(
      pattern,
      steps,
      this.deck.transloco.translate('editor.sound.shortenTitle'),
    );
    if (!kept) {
      return;
    }
    if (this.library.patterns().has(pattern.id)) {
      this.library.setPatternLength(pattern.id, steps, kept);
    } else {
      this.write({ steps, notes: kept });
    }
  }

  protected async clear(): Promise<void> {
    const pattern = this.pattern();
    await this.deck.clearSheet(
      pattern,
      {
        title: this.deck.transloco.translate('editor.sound.clearTitle', { n: pad2(pattern.slot) }),
        message: this.deck.transloco.translate('editor.sound.clearMessage', {
          n: pattern.notes.length,
        }),
        what: `pattern ${pad2(pattern.slot)}`,
      },
      () => {
        this.write({ notes: [] });
      },
    );
  }

  protected readonly items = computed<PickerItem[]>(() =>
    this.patterns().map((each) => this.item(each)),
  );
  protected readonly currentItem = computed(() => this.item(this.pattern()));

  private item(pattern: Pattern): PickerItem {
    const removable = this.library.patterns().has(pattern.id);
    return {
      key: pattern.id,
      number: pad2(pattern.slot),
      name: patternLabel(pattern),
      swatch: this.tint(pattern),
      canDuplicate: removable,
      canRemove: removable,
    };
  }

  protected readonly peersOf = (id: string): PresenceDot[] => {
    const pattern = this.library.patterns().get(id) ?? this.pattern();
    return pattern.id === id ? this.deck.patternPeers(pattern.slot) : [];
  };

  protected pick(id: string): void {
    const pattern = this.library.patterns().get(id);
    if (pattern) {
      this.store.selectPattern(pattern.slot);
    }
  }

  protected rename(event: { key: string; name: string }): void {
    if (event.key === this.pattern().id) {
      this.write({ name: event.name });
    }
  }
}
