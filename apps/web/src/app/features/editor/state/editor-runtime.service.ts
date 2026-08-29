import { Injectable, signal } from '@angular/core';
import type { NetUiBridgeService } from '@app/core/net/net-bridge.service';
import type { RuntimeHostService } from '@app/shared/game-screen/runtime-host.service';

/** The editor's one runtime (the console column's screen), reachable from any tab. */
@Injectable()
export class EditorRuntimeService {
  readonly host = signal<RuntimeHostService | null>(null);
  readonly bridge = signal<NetUiBridgeService | null>(null);
}
