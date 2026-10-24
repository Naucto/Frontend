import { Injectable, signal } from '@angular/core';

import type { RuntimeHostService } from './runtime-host.service';

/**
 * The runtime a game is mounted in right now, wherever it is on screen, for what reaches it from
 * outside its screen: a bug report attaching its frame and console.
 */
@Injectable({ providedIn: 'root' })
export class ActiveRuntimeService {
  private readonly host = signal<RuntimeHostService | null>(null);
  readonly current = this.host.asReadonly();

  claim(host: RuntimeHostService): void {
    this.host.set(host);
  }

  release(host: RuntimeHostService): void {
    if (this.host() === host) {
      this.host.set(null);
    }
  }
}
