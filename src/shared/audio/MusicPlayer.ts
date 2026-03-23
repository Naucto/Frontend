import * as Tone from "tone";
import { SoundProvider } from "@providers/editors/SoundProvider";
import { playMusicFromPosition } from "@modules/editor/SoundEditor/Music";

export class MusicPlayer {
  private _soundProvider: SoundProvider;

  constructor(soundProvider: SoundProvider) {
    this._soundProvider = soundProvider;
  }

  getSelectedIndex(): number {
    return this._soundProvider.getSelectedIndex();
  }

  async play(index?: number, startPosition: number = 0): Promise<void> {
    const musicIndex = index ?? this.getSelectedIndex();
    const music = this._soundProvider.getMusic(musicIndex);

    Tone.start();

    Tone.now();

    await playMusicFromPosition(
      music,
      startPosition,
      undefined,
      undefined,
      music.length
    );
  }

  stop(): void {
    Tone.Transport.cancel();
    Tone.Transport.stop();
  }
}
