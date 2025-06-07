
import * as Tone from "tone";
import { SampleLibrary } from "@modules/editor/SoundEditor/Tonejs-Instruments";

class Note {
  public samp: Tone.Sampler;
  constructor(
    public note: string = "Nan",
    private _duration: number = 1,
    public _instrument: string = "piano",
  ) {
    this.note = note;
    if (this.note == "Nan") {
      this.samp = new Tone.Sampler();
    } else {
      this.samp = SampleLibrary.load({
        instruments: this._instrument,

      }).toDestination();
    }

  }

  public get duration() : number {
    return this._duration;
  }

  public toJson() : string {
    return JSON.stringify({
      note: this.note,
      duration: this._duration,
      instrument: this._instrument
    });
  }

  public static fromJson(json: string | { note: string; duration: number; instrument: string }): Note {
    let data: { note: string; duration: number; instrument: string };

    if (typeof json === "string") {
      data = JSON.parse(json);
    } else {
      data = json;
    }

    return new Note(data.note, data.duration, data.instrument);
  }
}

export default Note;
