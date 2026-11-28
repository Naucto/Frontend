/** Game documents for Node services such as the Naucto MCP: no renderer, no audio device. */
export * from './diff/changes';
export * from './diff/decisions';
export * from './diff/lines';
export { displayState, mergeAccepted } from './diff/merge';
export {
  type MergeConflict,
  type MergeSide,
  mergeTexts,
  mergeThreeWay,
  SpritesRenumberedError,
  type ThreeWayMerge,
} from './diff/three-way';
export * from './game/cells';
export * from './game/defaults';
export { EditableGame, type ResizePreview } from './game/EditableGame';
export { type CodeFile, Game, type SoundLibraryPart } from './game/Game';
export { GameMap } from './game/GameMap';
export * from './game/geometry';
export * from './game/keys';
export { Sheet } from './game/Sheet';
export { type OpenState, openState } from './game/state';
export * from './input/actions';
export { INPUT_PRESET_IDS, INPUT_PRESETS, type InputPresetId } from './input/presets';
export * from './net/rules';
