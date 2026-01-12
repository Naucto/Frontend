import * as Y from "yjs";
import { SoundProviderError } from "@errors/SoundProviderError.ts";
import { MusicData, musicToJson, musicFromJson, createMusic } from "@modules/editor/SoundEditor/Music";
import { InstrumentConfig } from "@modules/editor/SoundEditor/InstrumentEditor";

export type SoundProviderListener = (musics: MusicData[]) => void;
export type CustomInstrumentsListener = (instruments: Map<string, InstrumentConfig>) => void;

export class SoundProvider implements Destroyable {
  private readonly _doc: Y.Doc;
  private _musicsArray: Y.Array<string>;
  private _selectedIndex: Y.Map<number>;
  private _customInstruments: Y.Map<string>;

  private _listeners = new Set<SoundProviderListener>();
  private _customInstrumentsListeners = new Set<CustomInstrumentsListener>();

  private readonly _boundCallListeners: () => void;
  private readonly _boundCallCustomInstrumentsListeners: () => void;

  private static readonly DEFAULT_MUSIC_COUNT = 16;

  constructor(ydoc: Y.Doc) {
    this._doc = ydoc;
    this._musicsArray = ydoc.getArray<string>("sound_musics");
    this._selectedIndex = ydoc.getMap<number>("sound_selectedIndex");
    this._customInstruments = ydoc.getMap<string>("sound_customInstruments");

    if (this._musicsArray.length === 0) {
      for (let i = 0; i < SoundProvider.DEFAULT_MUSIC_COUNT; i++) {
        const defaultMusic = createMusic();
        this._musicsArray.push([musicToJson(defaultMusic)]);
      }
    }

    if (!this._selectedIndex.has("index")) {
      this._selectedIndex.set("index", 0);
    }

    this._boundCallListeners = this._callListeners.bind(this);
    this._boundCallCustomInstrumentsListeners = this._callCustomInstrumentsListeners.bind(this);

    this._musicsArray.observe(this._boundCallListeners);
    this._customInstruments.observe(this._boundCallCustomInstrumentsListeners);
  }

  destroy(): void {
    this._listeners.clear();
    this._customInstrumentsListeners.clear();
    this._musicsArray.unobserve(this._boundCallListeners);
    this._customInstruments.unobserve(this._boundCallCustomInstrumentsListeners);
  }

  private _callListeners(): void {
    const musics = this.getMusics();
    this._listeners.forEach((callback) => callback(musics));
  }

  private _callCustomInstrumentsListeners(): void {
    const instruments = this.getCustomInstruments();
    this._customInstrumentsListeners.forEach((callback) => callback(instruments));
  }

  public getMusics(): MusicData[] {
    const musics: MusicData[] = [];
    for (let i = 0; i < this._musicsArray.length; i++) {
      try {
        const musicJson = this._musicsArray.get(i);
        if (musicJson) {
          musics.push(musicFromJson(musicJson));
        } else {
          musics.push(createMusic());
        }
      } catch {
        musics.push(createMusic());
      }
    }
    return musics;
  }

  public getMusic(index: number): MusicData {
    if (index < 0 || index >= this._musicsArray.length) {
      throw new SoundProviderError(`Music index out of bounds: ${index}`);
    }
    try {
      const musicJson = this._musicsArray.get(index);
      if (musicJson) {
        return musicFromJson(musicJson);
      }
      return createMusic();
    } catch {
      return createMusic();
    }
  }

  public setMusic(index: number, music: MusicData): void {
    if (index < 0 || index >= this._musicsArray.length) {
      throw new SoundProviderError(`Music index out of bounds: ${index}`);
    }
    const musicJson = musicToJson(music);
    const currentJson = this._musicsArray.get(index);
    if (currentJson !== musicJson) {
      this._doc.transact(() => {
        this._musicsArray.delete(index, 1);
        this._musicsArray.insert(index, [musicJson]);
      });
    }
  }

  public getSelectedIndex(): number {
    return this._selectedIndex.get("index") || 0;
  }

  public setSelectedIndex(index: number): void {
    if (index < 0 || index >= this._musicsArray.length) {
      throw new SoundProviderError(`Selected index out of bounds: ${index}`);
    }
    this._selectedIndex.set("index", index);
  }

  public getCustomInstruments(): Map<string, InstrumentConfig> {
    const instruments = new Map<string, InstrumentConfig>();
    this._customInstruments.forEach((value, key) => {
      try {
        const config = JSON.parse(value) as InstrumentConfig;
        instruments.set(key, config);
      } catch {
        void 0;
      }
    });
    return instruments;
  }

  public setCustomInstrument(name: string, config: InstrumentConfig): void {
    const configJson = JSON.stringify(config);
    this._customInstruments.set(name, configJson);
  }

  public deleteCustomInstrument(name: string): void {
    this._customInstruments.delete(name);
  }

  public observe(callback: SoundProviderListener): void {
    this._listeners.add(callback);
    const musics = this.getMusics();
    callback(musics);
  }

  public unobserve(callback: SoundProviderListener): void {
    this._listeners.delete(callback);
  }

  public observeCustomInstruments(callback: CustomInstrumentsListener): void {
    this._customInstrumentsListeners.add(callback);
    const instruments = this.getCustomInstruments();
    callback(instruments);
  }

  public unobserveCustomInstruments(callback: CustomInstrumentsListener): void {
    this._customInstrumentsListeners.delete(callback);
  }
}

