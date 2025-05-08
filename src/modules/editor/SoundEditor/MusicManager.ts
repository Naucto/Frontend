
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

  synth: Tone.Synth = new Tone.Synth().toDestination();
  duoSynth: Tone.DuoSynth = new Tone.DuoSynth().toDestination();
  polySynth: Tone.PolySynth = new Tone.PolySynth().toDestination();
  noise: Tone.Noise = new Tone.Noise("pink").toDestination();

  synthTypeFunctionMap: { [key: number]: Tone.Synth | Tone.DuoSynth | Tone.PolySynth } = {}
  activeSounds: AudioBufferSourceNode[] = [];
  constructor() {
    this.synthTypeFunctionMap = {
      [SynthType.SYNTH]: this.synth,
      [SynthType.DUOSYNTH]: this.duoSynth,
      [SynthType.POLYSYNTH]: this.polySynth,
    }
  }

  playNote(note: string, synthType: SynthType, duration: Time, when = Tone.now()) {
    synthType = synthType % 3;
    return this.synthTypeFunctionMap[synthType].triggerAttackRelease(note, duration, when);
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