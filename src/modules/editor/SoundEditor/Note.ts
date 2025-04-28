
import * as Tone from "tone";
import { SampleLibrary } from "./Tonejs-Instruments.js"



class Note {
  constructor(
    public note: string = "Nan",
    public duration: number = 1,
    public instrument: string = "piano",
  ) {
    this.note = note;
    this.duration = duration;
    this.instrument = instrument;
    /* this.sampler = SampleLibrary.load({
      instruments: this.instrument
      });
    this.sampler.toDestination(); */
    
  }

  get durationInSeconds(): number {
    return this.duration / 1000;
  }
}

export default Note;