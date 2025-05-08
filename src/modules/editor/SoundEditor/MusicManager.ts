
import * as Tone from "tone";
import { Time } from "tone/build/esm/core/type/Units";

const AllNotes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

interface SynthNote {
  note: string;
  duration: string;
  type: SynthType;
  volume: number;
}

export type { SynthNote };

enum SynthType {
  SYNTH = 0,
  DUOSYNTH = 1,
  POLYSYNTH = 2,
  // NOISE = 3
}

class MusicManager {
  public numberToNote(number: number): string {
    if (number < 0) {
      throw new Error("Number out of bounds");
    }
    const note = AllNotes.length - number % AllNotes.length - 1;
    const octave = 4 - Math.floor(number / AllNotes.length);
    const result = AllNotes[note] + String(octave);
    return result;
  }
  playInstrument(sampler: Tone.Sampler, note: string, when = Tone.now(), duration: Time): void {
    if (note == "Nan") {
      return;
    }
    Tone.loaded().then(() => {
      console.log(note, duration, when);
      sampler.triggerAttackRelease(note, duration, when);
    });
  }
}

export { AllNotes, MusicManager };
