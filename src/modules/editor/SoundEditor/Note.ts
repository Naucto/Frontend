import * as Tone from "tone";


import pianoConfig from "./instruments/piano.json";
import trumpetConfig from "./instruments/trumpet.json";
import fluteConfig from "./instruments/flute.json";
import guitarConfig from "./instruments/guitar.json";
import harmonicaConfig from "./instruments/harmonica.json";
import contrabassConfig from "./instruments/contrabass.json";


const instrumentConfigs = new Map<string, any>();
const configPromises = new Map<string, Promise<any>>();


const initializeConfigs = () => {
  instrumentConfigs.set("piano", pianoConfig);
  instrumentConfigs.set("trumpet", trumpetConfig);
  instrumentConfigs.set("flute", fluteConfig);
  instrumentConfigs.set("guitar", guitarConfig);
  instrumentConfigs.set("harmonica", harmonicaConfig);
  instrumentConfigs.set("contrabass", contrabassConfig);
};


initializeConfigs();

export const registerCustomInstrument = (name: string, config: any): void => {
  instrumentConfigs.set(name, config);

  if (synths.has(name)) {
    synths.delete(name);
  }

  createSynth(name);
};


const loadInstrumentConfig = async (instrument: string): Promise<any> => {

  if (instrumentConfigs.has(instrument)) {
    return instrumentConfigs.get(instrument);
  }


  if (configPromises.has(instrument)) {
    return configPromises.get(instrument);
  }


  const loadPromise = (async () => {
    try {
      const config = await import(`./instruments/${instrument}.json`);
      instrumentConfigs.set(instrument, config.default);
      configPromises.delete(instrument);
      return config.default;
    } catch (error) {
      configPromises.delete(instrument);
      return null;
    }
  })();

  configPromises.set(instrument, loadPromise);
  return loadPromise;
};

const synths = new Map<string, any>();

const createSynth = (instrument: string): any => {

  if (synths.has(instrument)) {
    return synths.get(instrument);
  }

  let synth: any;
  switch (instrument) {
    case "fm":
      synth = new Tone.FMSynth().toDestination();
      break;
    default:

      const config = instrumentConfigs.get(instrument);
      if (config) {
        synth = new Tone.AMSynth(config).toDestination();
      } else {

        synth = new Tone.Synth().toDestination();
      }
      break;
  }
  synths.set(instrument, synth);
  return synth;
};

// Pre-initialize default instruments on startup (after createSynth is defined)
const defaultInstruments = ["piano", "trumpet", "flute", "guitar", "harmonica", "contrabass"];
defaultInstruments.forEach(instrument => {
  createSynth(instrument);
});



export const ensureSynth = async (instrument: string): Promise<void> => {
  if (synths.has(instrument)) {
    return;
  }

  // Load config if needed
  if (!instrumentConfigs.has(instrument)) {
    const config = await loadInstrumentConfig(instrument);
    if (config) {
      instrumentConfigs.set(instrument, config);
    }
  }

  // Use createSynth which has proper caching
  createSynth(instrument);
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

export const getSynth = (instrument: string): Tone.Synth | undefined => {
  return synths.get(instrument);
};

// Pre-initialize all synths that will be used in the music
export const preInitializeSynths = async (instruments: string[]): Promise<void> => {
  const uniqueInstruments = [...new Set(instruments)];
  await Promise.all(uniqueInstruments.map(instrument => ensureSynth(instrument)));
};


export const getRegisteredInstruments = (): string[] => {
  return Array.from(instrumentConfigs.keys());
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
