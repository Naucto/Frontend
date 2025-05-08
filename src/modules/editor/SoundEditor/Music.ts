
import Note from "@modules/editor/SoundEditor/Note";
import { AllNotes, MusicManager } from "@modules/editor/SoundEditor/MusicManager";
import * as Tone from "tone";

class Music {

  private _notes: Note[][];
  private _bpm: number;
  private _musicManager: MusicManager;
  private _numberOfNotes: number;

  constructor(
    bpm: number = 240,
    length: number = 32,
    numberOfOctaves: number = 2,
  ) {
    this._numberOfNotes = AllNotes.length * numberOfOctaves;
    this._notes = new Array<Note[]>(length);
    for (let i = 0; i < length; i++) {
      this._notes[i] = new Array<Note>(this._numberOfNotes);
      for (let j = 0; j < this._numberOfNotes; j++) {
        this._notes[i][j] = new Note();
      }
    }
    this._bpm = bpm;
    this._musicManager = new MusicManager();
  }

  get notes(): Note[][] {
    return this._notes;
  }


  public setNote(position: number, note: number, duration: number, instrument: string): void {

    console.log(position);
    if (position < 0 || position >= this._notes.length) {
      throw new Error("Position out of bounds");
    }
    if (this._notes[position][note].note === "Nan") {
      this._notes[position][note] = new Note(this._musicManager.numberToNote(note), duration, instrument);
    } else {
      this._notes[position][note] = new Note();
    }
  }

  get bpm(): number {
    return this._bpm;
  }

  public setBpm(bpm: number): void {
    this._bpm = bpm;
  }

  public isNoteActive(position: number, note: number): boolean {
    if (position < 0 || position >= this._notes.length) {
      throw new Error("Position out of bounds");
    }
    if (note < 0 || note >= this._notes[position].length) {
      throw new Error("Note out of bounds");
    }
    return this._notes[position][note].note !== "Nan";
  }

  public play(): void {
    let now = Tone.now();
    Tone.start();
    for (const noteList of this._notes) {
      for (const note of noteList) {
        if (note.note != "Nan") {
          this._musicManager.playInstrument(note.samp, note.note, now, 60 / this._bpm * note.duration);
        }
      }
      now += 60 / this._bpm;
    }
  }

  public toJson(): string {
    return JSON.stringify({
      bpm: this._bpm,
      length: this._notes.length,
      numberOfOctaves: this._numberOfNotes / AllNotes.length,
      notes: this._notes.map(row => row.map(note => note.toJson())),
    });
  }

  public static fromJson(json: string): Music {
    const data = JSON.parse(json);

    const music = new Music(data.bpm, data.length, data.numberOfOctaves);

    music._notes = data.notes.map((row: Note[]) =>
      row.map(noteData => Note.fromJson(noteData))
    );

    return music;
  }
}

export default Music;