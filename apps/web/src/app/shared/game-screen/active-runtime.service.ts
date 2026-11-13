import { computed, Injectable, signal } from '@angular/core';

import type { RuntimeHostService } from './runtime-host.service';

/**
 * The runtime a game is mounted in right now, wherever it is on screen, for what reaches it from
 * outside its screen: a bug report attaching its frame and console. Runtimes can be mounted at
 * once, as the NET test rig is beside the editor's, so the latest one to claim is current and its
 * release hands back to the one before.
 */
@Injectable({ providedIn: 'root' })
export class ActiveRuntimeService {
  private readonly hosts = signal<RuntimeHostService[]>([]);
  readonly current = computed(() => this.hosts().at(-1) ?? null);

  claim(host: RuntimeHostService): void {
    this.hosts.update((hosts) => [...hosts.filter((held) => held !== host), host]);
  }

  release(host: RuntimeHostService): void {
    this.hosts.update((hosts) => hosts.filter((held) => held !== host));
  }
}
