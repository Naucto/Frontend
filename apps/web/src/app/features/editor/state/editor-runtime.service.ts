import { Injectable, signal } from '@angular/core';
import type { NetUiBridgeService } from '@app/core/net/net-bridge.service';
import type { RuntimeHostService } from '@app/shared/game-screen/runtime-host.service';

/** The editor's one runtime (the console column's screen), reachable from any tab. */
@Injectable()
export class EditorRuntimeService {
  readonly host = signal<RuntimeHostService | null>(null);
  readonly bridge = signal<NetUiBridgeService | null>(null);
  /** Set by the CODE tab while it is open: inserts text at the caret, returns false when no editor. */
  insertAtCursor: ((text: string) => boolean) | null = null;
  /** Also set by the CODE tab: the dotted name under the caret, for F1. */
  symbolAtCursor: (() => string | null) | null = null;
}
