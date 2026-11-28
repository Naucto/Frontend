/** Game documents for Node services such as the Naucto MCP: no renderer, no audio device. */
export * from './diff/changes';
export * from './diff/decisions';
export * from './diff/lines';
export { displayState, mergeAccepted } from './diff/merge';
export { AI_KEYS, aiContext, decodeState, encodeState } from './game/ai-context';
export { EditableGame, RESTORE_KINDS } from './game/EditableGame';
export { Game } from './game/Game';
export * from './game/geometry';
export * from './game/keys';
export { isFromFutureSchema, migrateGame } from './migrations';
