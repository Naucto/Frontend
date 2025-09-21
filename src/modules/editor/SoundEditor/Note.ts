import * as Tone from "tone";

const samplers = new Map<string, Tone.Sampler>();
const synths = new Map<string, any>();

const samplerLoadingPromises = new Map<string, Promise<void>>();

const createSamplerWithPromise = (instrument: string): Promise<void> => {
  return new Promise<void>((resolve) => {
    try {
      const sampler = SampleLibrary.load({
        instruments: instrument,
        ext: ".mp3",
      }).toDestination();

      samplers.set(instrument, sampler);

      setTimeout(() => {
        resolve();
      }, 2000);

    } catch {
      resolve();
    }
  });
};

const createSynth = (instrument: string): any => {
  let synth: any;
  switch (instrument) {
    case "fm":
      synth = new Tone.FMSynth().toDestination();
      break;
    default:
      synth = new Tone.Synth().toDestination();
      break;
  }
  synths.set(instrument, synth);
  return synth;
};

export const createNote = (
  note: string = "D4",
  duration: number = 0.25,
  instrument: string = "piano"
): NoteData => {
  if (!synths.has(instrument)) {
    createSynth(instrument);
  }

  return {
    note,
    duration,
    instrument,
  };
};

export const preloadInstruments = async (): Promise<void> => {
  const instruments = [
    "bass-electric",
    "bassoon",
    "cello",
    "clarinet",
    "contrabass",
    "flute",
    "french-horn",
    "guitar-acoustic",
    "guitar-electric",
    "guitar-nylon",
    "harmonium",
    "harp",
    "organ",
    "piano",
    "saxophone",
    "trombone",
    "trumpet",
    "tuba",
    "violin",
    "xylophone"
  ];

  try {
    await Promise.all(
      instruments.map(async (instrument) => {
        if (!samplers.has(instrument)) {
          const loadingPromise = createSamplerWithPromise(instrument);
          samplerLoadingPromises.set(instrument, loadingPromise);
          await loadingPromise;
        }
      })
    );
  } catch {
    // continue even if some instruments fail to load
    return;
  }
};

export const isSamplerReady = (instrument: string): boolean => {
  const sampler = samplers.get(instrument);
  return sampler !== undefined;
};

export const getSynth = (instrument: string): any | undefined => {
  return synths.get(instrument);
};

export const getSampler = (instrument: string): Tone.Sampler | undefined => {
  return samplers.get(instrument);
};

export const getSamplerLoadingPromise = (instrument: string): Promise<void> | undefined => {
  return samplerLoadingPromises.get(instrument);
};

export interface NoteData {
  note: string;
  duration: number;
  instrument: string;
}

export const noteToJson = (note: NoteData): string => {
  return JSON.stringify({
    note: note.note,
    duration: note.duration,
    instrument: note.instrument
  });
};

export const noteFromJson = (json: string | NoteData): NoteData => {
  if (typeof json === "string") {
    const parsed = JSON.parse(json);
    return createNote(parsed.note, parsed.duration, parsed.instrument);
  }
  return json;
};
