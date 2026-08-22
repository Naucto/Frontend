import { UserId } from "@engine/net/SessionTransport";

export type InboundFrame =
  | { type: "state"; data?: unknown }
  | { type: "response"; data?: unknown }
  | { type: "request"; from: UserId; data?: unknown }
  | { type: "signal"; from?: UserId; data?: unknown }
  | { type: "peer-joined"; userId: UserId }
  | { type: "peer-left"; userId: UserId }
  | { type: "session-ended" };

export type OutboundFrame =
  | { type: "state"; data?: unknown }
  | { type: "request"; data?: unknown }
  | { type: "response"; to: UserId; data?: unknown }
  | { type: "signal"; to?: UserId; data?: unknown };
