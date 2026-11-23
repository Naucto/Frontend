import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { defaultSfx, type Note, type Pattern, type Sfx, stepsAfterEdit } from '@naucto/engine';

import { type PickerItem, SoundPickerComponent } from '../controls/sound-picker.component';
import { SoundDeck } from '../sound-deck';
import { pad2 } from '../sound-library';
import { NoteSheetEditorComponent } from './note-sheet-editor.component';

const SFX_NAME_MAX = 16;

@Component({
  selector: 'nc-sfx-editor',
  imports: [TranslocoDirective, NoteSheetEditorComponent, SoundPickerComponent],
  templateUrl: './sfx-editor.component.html',
  host: { class: 'block h-full' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SfxEditorComponent {
  protected readonly deck = inject(SoundDeck);
  protected readonly store = this.deck.store;
  private readonly library = this.deck.library;
  protected readonly pad = pad2;

  protected readonly slots = computed(() =>
    [...this.library.sfx()]
      .map(([slot, sfx]) => ({ slot: Number(slot), sfx }))
      .filter((entry) => Number.isInteger(entry.slot))
      .sort((a, b) => a.slot - b.slot),
  );
  protected readonly sfx = computed<Sfx>(
    () => this.library.sfx().get(String(this.store.sfxSlot())) ?? defaultSfx(),
  );
  protected readonly sheet = computed<Pattern>(() => ({
    ...this.sfx(),
    id: `sfx-${String(this.store.sfxSlot())}`,
    slot: this.store.sfxSlot(),
  }));

  protected nameOf(slot: number, sfx: Sfx): string {
    return sfx.name.trim() || `sfx ${pad2(slot)}`;
  }

  private write(patch: Partial<Sfx>): void {
    const { name, bpm, stepsPerBeat, steps, notes } = { ...this.sfx(), ...patch };
    this.library.putSfx(this.store.sfxSlot(), { name, bpm, stepsPerBeat, steps, notes });
  }

  protected setNotes(notes: Note[]): void {
    const sheet = this.sfx();
    const steps = stepsAfterEdit(sheet, notes);
    this.write(steps === sheet.steps ? { notes } : { notes, steps });
  }

  protected setBpm(bpm: number): void {
    this.write({ bpm });
  }

  protected async setSteps(steps: number): Promise<void> {
    const sfx = this.sfx();
    const kept: Note[] = sfx.notes
      .filter((note) => note.step < steps)
      .map((note) => ({ ...note, length: Math.min(note.length, steps - note.step) }));
    if (kept.length < sfx.notes.length) {
      const confirmed = await this.deck.dialogs.confirmDanger({
        title: this.deck.transloco.translate('editor.sound.shortenSfxTitle'),
        message: this.deck.transloco.translate('editor.sound.shortenMessage', {
          n: sfx.notes.length - kept.length,
        }),
        confirmLabel: this.deck.transloco.translate('editor.sound.shorten'),
      });
      if (!confirmed) {
        return;
      }
    }
    this.write({ steps, notes: kept });
  }

  protected async clear(): Promise<void> {
    const sfx = this.sfx();
    if (!sfx.notes.length) {
      return;
    }
    const confirmed = await this.deck.dialogs.confirmDanger({
      title: this.deck.transloco.translate('editor.sound.clearSfxTitle', {
        n: pad2(this.store.sfxSlot()),
      }),
      message: this.deck.transloco.translate('editor.sound.clearSfxMessage', {
        n: sfx.notes.length,
      }),
      confirmLabel: this.deck.transloco.translate('editor.sound.clear'),
    });
    if (confirmed) {
      this.deck.removeWithUndo(
        () => {
          this.write({ notes: [] });
        },
        this.deck.transloco.translate('editor.sound.toast.notesCleared', {
          n: sfx.notes.length,
          what: `SFX ${pad2(this.store.sfxSlot())}`,
        }),
      );
    }
  }

  protected readonly items = computed<PickerItem[]>(() => {
    const top = Math.max(this.store.sfxSlot(), ...this.slots().map((entry) => entry.slot));
    return Array.from({ length: top + 1 }, (_, slot) => this.item(slot));
  });
  protected readonly currentItem = computed(() => this.item(this.store.sfxSlot()));

  private item(slot: number): PickerItem {
    const sfx = this.library.sfx().get(String(slot));
    return {
      key: String(slot),
      number: pad2(slot),
      name: sfx ? this.nameOf(slot, sfx) : this.deck.transloco.translate('editor.sound.emptySlot'),
      free: !sfx,
      canDuplicate: !!sfx,
      canRemove: !!sfx,
    };
  }

  protected pick(key: string): void {
    this.store.selectSfx(Number(key));
  }

  protected create(): void {
    const slot = this.library.nextSfxSlot();
    this.library.putSfx(slot, defaultSfx());
    this.store.selectSfx(slot);
  }

  protected duplicate(key: string): void {
    const sfx = this.library.sfx().get(key);
    if (!sfx) {
      return;
    }
    const slot = this.library.nextSfxSlot();
    this.library.putSfx(slot, { ...sfx, notes: sfx.notes.map((note) => ({ ...note })) });
    this.store.selectSfx(slot);
  }

  protected rename(event: { key: string; name: string }): void {
    if (Number(event.key) === this.store.sfxSlot()) {
      this.write({ name: event.name.slice(0, SFX_NAME_MAX) });
    }
  }

  protected async remove(key: string): Promise<void> {
    const slot = Number(key);
    const held = this.library.sfx().get(key);
    if (!held) {
      return;
    }
    const confirmed = await this.deck.dialogs.confirmDanger({
      title: this.deck.transloco.translate('editor.sound.removeSfxTitle', {
        n: pad2(slot),
        name: this.nameOf(slot, held),
      }),
      message: this.deck.transloco.translate('editor.sound.removeSfxMessage', { n: slot }),
      confirmLabel: this.deck.transloco.translate('editor.sound.removeSfx'),
    });
    if (confirmed) {
      const name = this.nameOf(slot, held);
      this.deck.removeWithUndo(
        () => {
          this.library.removeSfx(slot);
        },
        this.deck.transloco.translate('editor.sound.toast.sfxRemoved', { name, n: pad2(slot) }),
      );
    }
  }
}
