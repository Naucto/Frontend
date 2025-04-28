
import * as Tone from 'tone';


const AllNotes = [
    'A',
    'A#',
    'B',
    'C',
    'C#',
    'D',
    'D#',
    'E',
    'F',
    'F#',
    'G',
    'G#'
];

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
        let note = number % AllNotes.length;
        let octave = Math.floor(number / AllNotes.length) + 4;
        let result = AllNotes[note] + String(octave);
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

    playNote(note: string, synthType: SynthType, duration: string = "8n", when = Tone.now()) {
        synthType = synthType % 3;
        return this.synthTypeFunctionMap[synthType].triggerAttackRelease(note, duration, when);
    }

    playInstrument(sampler: Tone.Sampler, note: string, when = Tone.now(), duration = "8n") {
        if (note == "Nan") {
            return;
        }
        Tone.loaded().then(() => {
            console.log(note, duration, when);
            sampler.triggerAttackRelease(note, duration, when);
        });
    }

    playSynthNote(synthNote: SynthNote) {
        this.synthTypeFunctionMap[synthNote.type].volume.value = synthNote.volume;
        return this.playNote(synthNote.note, synthNote.type);
    }
}

export { AllNotes, MusicManager };