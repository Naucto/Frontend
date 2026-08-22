import { ApiContext } from "./ApiContext";
import { EngineModule } from "./EngineModule";
import { errorMessage } from "./errorMessage";

export class SoundAPI extends EngineModule {
  constructor(ctx: ApiContext) {
    super(ctx);
    ctx.lua.setGlobalWith("play_music", this._playMusic.bind(this));
    ctx.lua.setGlobalWith("stop_music", this._stopMusic.bind(this));
  }

  private _playMusic(index?: number): void {
    const sounds = this.ctx.sounds;
    if (!sounds) {
      return;
    }
    sounds.play(index).catch((error) => {
      if (error instanceof Error) {
        this.ctx.print(errorMessage(error));
      }
    });
  }

  private _stopMusic(): void {
    this.ctx.sounds?.stop();
  }
}
