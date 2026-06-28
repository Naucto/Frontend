import { SharedTableSession } from "./SharedTableSession";

// Implemented app-side: the modal flow that creates/joins a session (REST +
// transport) and hands the engine the live SharedTableSession, or null on cancel.
export interface NetUi {
  host(onReady: (session: SharedTableSession | null) => void): void;
  join(onReady: (session: SharedTableSession | null) => void): void;
  leave(): void;
}
