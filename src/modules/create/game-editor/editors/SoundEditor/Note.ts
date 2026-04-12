import * as Tone from "tone";

import pianoConfig from "./instruments/piano.json";
import trumpetConfig from "./instruments/trumpet.json";
import fluteConfig from "./instruments/flute.json";
import guitarConfig from "./instruments/guitar.json";
import harmonicaConfig from "./instruments/harmonica.json";
import contrabassConfig from "./instruments/contrabass.json";

const instrumentConfigs = new Map<string, unknown>();
const configPromises = new Map<string, Promise<unknown>>();

const initializeConfigs = (): void => {
  instrumentConfigs.set("piano", pianoConfig);
  instrumentConfigs.set("trumpet", trumpetConfig);
  instrumentConfigs.set("flute", fluteConfig);
  instrumentConfigs.set("guitar", guitarConfig);
  instrumentConfigs.set("harmonica", harmonicaConfig);
  instrumentConfigs.set("contrabass", contrabassConfig);
};

initializeConfigs();

export const registerCustomInstrument = (name: string, config: unknown): void => {
  instrumentConfigs.set(name, config);

  if (synths.has(name)) {
    synths.delete(name);
  }

  createSynth(name);
};

const loadInstrumentConfig = async (instrument: string): Promise<unknown> => {
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
    } catch {
      configPromises.delete(instrument);
      return null;
    }
  })();

  configPromises.set(instrument, loadPromise);
  return loadPromise;
};

const synths = new Map<string, Tone.Synth | Tone.FMSynth | Tone.AMSynth>();

const createSynth = (instrument: string): Tone.Synth | Tone.FMSynth | Tone.AMSynth => {
  if (synths.has(instrument)) {
    return synths.get(instrument)!;
  }

  let synth: Tone.Synth | Tone.FMSynth | Tone.AMSynth;
  switch (instrument) {
    case "fm": {
      synth = new Tone.FMSynth().toDestination();
      break;
    }
    default: {
      const config = instrumentConfigs.get(instrument);
      if (config) {
        synth = new Tone.AMSynth(config as Tone.AMSynthOptions).toDestination();
      } else {
        synth = new Tone.Synth().toDestination();
      }
      break;
    }
  }
  synths.set(instrument, synth);
  return synth;
};

const defaultInstruments = ["piano", "trumpet", "flute", "guitar", "harmonica", "contrabass"];
defaultInstruments.forEach(instrument => {
  createSynth(instrument);
});

export const ensureSynth = async (instrument: string): Promise<void> => {
  if (synths.has(instrument)) {
    return;
  }

  if (!instrumentConfigs.has(instrument)) {
    const config = await loadInstrumentConfig(instrument);
    if (config) {
      instrumentConfigs.set(instrument, config);
    }
  }

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

export const getSynth = (instrument: string): Tone.Synth | Tone.FMSynth | Tone.AMSynth | undefined => {
  return synths.get(instrument);
};

export const stopAllSynths = (): void => {
  synths.forEach(synth => {
    if ("triggerRelease" in synth && typeof synth.triggerRelease === "function") {
      synth.triggerRelease();
    }
    if ("releaseAll" in synth && typeof synth.releaseAll === "function") {
      (synth as { releaseAll: () => void }).releaseAll();
    }
  });
};

export const preInitializeSynths = async (instruments: string[]): Promise<void> => {
  const uniqueInstruments = [...new Set(instruments)];
  await Promise.all(uniqueInstruments.map(instrument => ensureSynth(instrument)));
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
