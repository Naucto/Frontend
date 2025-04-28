
import Note from '@modules/editor/SoundEditor/Note';
import { AllNotes, MusicManager } from '@modules/editor/SoundEditor/MusicManager';
import * as Tone from 'tone';

class Music {

    private _notes: Note[][];
    private _bpm: number;
    private _musicManager: MusicManager;

    constructor(
        bpm: number = 120,
        length: number = 32,
        numberOfOctaves: number = 2,
    ) {
        const numberOfNotes = AllNotes.length * numberOfOctaves;
        this._notes = new Array<Note[]>(length);
        for (let i = 0; i < length; i++) {
            this._notes[i] = new Array<Note>(numberOfNotes);
            for (let j = 0; j < numberOfNotes; j++) {
                this._notes[i][j] = new Note();
            }
        }
        this._bpm = bpm;
        this._musicManager = new MusicManager();
    }

    get notes(): Note[][] {
        return this._notes;
    }

    public setNote(position : number, note : number, duration : number, instrument : string): void {

        if (position < 0 || position >= this._notes.length) {
            throw new Error("Position out of bounds");
        }
        if (this._notes[position][note].note == "Nan") {
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

    public play() {
        let now = Tone.now();
        Tone.start();
        for (let noteList of this.notes) {
            for (let note of noteList) {
                this._musicManager.playInstrument(note.samp, note.note, now);
                
            }
            now += 0.30;
        }
    }
}

export default Music;