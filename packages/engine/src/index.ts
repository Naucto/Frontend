export type { ApiContext } from './api/ApiContext';
export { buildCompatPrelude } from './api/compatPrelude';
export { LEGACY_ALIASES, LUA_API, type LuaApiEntry } from './api/luaApiTable';
export type {
  ConsoleLevel,
  EnginePorts,
  GameData,
  GfxBackend,
  ScanlineEffect,
  SoundPort,
  SysPort,
} from './api/ports';
export * from './game/defaults';
export { type CodeFile, Game, LOCAL_ORIGIN, type PixelChange, type TileChange } from './game/Game';
export * from './game/keys';
export { computeSizeReport, type SizeReport } from './game/size';
export { buildFontAtlas, FONT_HEIGHT, FONT_WIDTH } from './gfx/Font';
export { hexToRgb, rgbToHex, WebGlError } from './gfx/glUtils';
export { RecordingBackend } from './gfx/RecordingBackend';
export { WebGL2Backend } from './gfx/WebGL2Backend';
export * from './input/ActionMap';
export { GamepadSource } from './input/GamepadSource';
export type { InputSource } from './input/InputSource';
export { InputState } from './input/InputState';
export { KeyboardSource } from './input/KeyboardSource';
export { TouchSource } from './input/TouchSource';
export { ConsoleBuffer, type ConsoleEntry, type ConsoleEvent } from './loop/ConsoleBuffer';
export { GameLoop, type LoopDriver, STEP_MS } from './loop/GameLoop';
export { Stats } from './loop/Stats';
export {
  migrateGame,
  MIGRATION_ORIGIN,
  type MigrationReport,
  type MigrationWarning,
  needsMigration,
} from './migrations';
export type { InboundFrame, OutboundFrame } from './net/frames';
export { ALLOW_ALL, type NetPermissions } from './net/NetPermissions';
export type { NetHostOptions, NetUi } from './net/NetUi';
export { type RefreshedTicket, SessionSignalingSocket } from './net/SessionSignalingSocket';
export type {
  SessionRole,
  SessionTransport,
  SessionTransportEvents,
  UserId,
} from './net/SessionTransport';
export { SharedTableSession, type TableScalar } from './net/SharedTableSession';
export {
  SyncedSessionTransport,
  type SyncedSessionTransportOptions,
} from './net/SyncedSessionTransport';
export { Engine, type EngineOptions, type EngineState } from './runtime/Engine';
export type { EngineError, EnginePhase } from './runtime/EngineError';
export * from './sound/model';
export {
  decodeSample,
  encodeSample,
  MAX_SAMPLE_SECONDS,
  SAMPLE_RATE,
  toSampleBytes,
} from './sound/sample-codec';
export { Sequencer } from './sound/Sequencer';
export { SoundEngine } from './sound/SoundEngine';
export { SynthCore } from './sound/SynthCore';
export { type AudioBackend, WebAudioBackend } from './sound/WebAudioBackend';
export type { SynthCommand, SynthEvent } from './sound/worklet/protocol';
export type { Destroyable, Maybe, Point2D, Size } from './types';
export { ENGINE_VERSION } from './version';
export { LuaEnvironment, LuaError, parseLuaErrorLocation } from './vm/LuaEnvironment';
