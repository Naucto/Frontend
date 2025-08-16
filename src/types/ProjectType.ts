import { SpriteSheet } from "src/types/SpriteSheetType";
import { ProjectResponseDto } from "../api";
import { Map } from "./MapType";

export type Project =  {
  spriteSheet: SpriteSheet;
  map: Map;
  palette: Uint8Array;
  projectResponseDto: ProjectResponseDto;
}
