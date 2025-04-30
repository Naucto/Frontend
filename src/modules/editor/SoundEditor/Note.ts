
import * as Tone from "tone";
import { SampleLibrary } from "@modules/editor/SoundEditor/Tonejs-Instruments"



class Note {
  public samp: Tone.Sampler;
  constructor(
    public note: string = "Nan",
    private _duration: number = 1,
    public instrument: string = "piano",
  ) {
    this.note = note;
    this._duration = _duration;
    this.instrument = instrument;
    if (this.note == "Nan") {
      this.samp = new Tone.Sampler();
    } else {
      this.samp = SampleLibrary.load({
        instruments: this.instrument,
        onload: () => {
          console.log('Sampler is fully loaded!');
      }

      }).toDestination();
      console.log(this.samp);
    }

  }

  public get duration() {
    return this._duration;
  }

  public toJson() {
    return {
      note: this.note,
      duration: this._duration,
      instrument: this.instrument
    };
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