import { LuaEnvironment } from "@engine/lua/LuaEnvironment";
import { NetUi } from "@engine/net/NetUi";
import { InputSource, MapSource, Renderer, SoundPlayer, SpriteSource } from "@engine/ports";

export interface ApiContext {
  lua: LuaEnvironment;
  renderer: Renderer;
  sprites: SpriteSource;
  maps: MapSource;
  input: InputSource;
  sounds?: SoundPlayer;
  ui?: NetUi;
  print: (line: string) => void;
}
