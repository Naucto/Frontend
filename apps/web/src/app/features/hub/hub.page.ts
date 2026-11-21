import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DitherBackdropComponent } from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';

import { diskBody, diskStyleFor } from '../../shared/game-card/disk-style';
import { injectHubFeed, type ResultsQuery } from '../../shared/queries/hub.queries';
import { qk } from '../../shared/queries/query-keys';
import { HubFeedComponent } from './hub-feed.component';
import { HubResultsComponent } from './hub-results.component';

/**
 * The hub, or what a search, a tag or a shelf holds when the address asks for one. Either stands
 * over a ground in the colours of the game the hero has in front.
 */
@Component({
  selector: 'nc-hub-page',
  imports: [DitherBackdropComponent, HubFeedComponent, HubResultsComponent],
  templateUrl: './hub.page.html',
  host: {
    class:
      'relative isolate block px-[calc(var(--nc-page-gutter)-var(--spacing)*2)] pt-[20px] pb-[72px] [--nc-page-gutter:clamp(28px,5vw,100px)] md:px-[calc(var(--nc-page-gutter)-var(--spacing)*3)] md:pt-[12px]',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class HubPage {
  /** `?q=` from the top-bar search. */
  // eslint-disable-next-line id-length -- bound to the ?q= query parameter the search links send
  readonly q = input<string>();
  /** `?tags=`, comma-separated: a game must carry all of them. */
  readonly tags = input<string>();
  /** `?shelf=`, the key of a shelf opened out by its "see all". */
  readonly shelf = input<string>();

  /** What the address asks to list; null for the hub itself. A shelf outranks a search. */
  protected readonly results = computed<ResultsQuery | null>(() => {
    const shelf = this.shelf()?.trim();
    const search = this.q()?.trim();
    const tags = this.tags()?.trim();
    if (shelf) {
      return { shelf };
    }
    return search || tags ? { ...(search ? { search } : {}), ...(tags ? { tags } : {}) } : null;
  });

  protected readonly feed = injectHubFeed();
  protected readonly front = signal(0);
  protected readonly lead = computed(() => this.feed.data()?.hero[this.front()]?.game ?? null);
  /** What the ground takes when the cover gives no colours. */
  protected readonly tint = computed(() => {
    const lead = this.lead();
    return lead ? diskBody(diskStyleFor(lead)) : null;
  });

  constructor() {
    // Refetch on every arrival: the catalogue changes elsewhere in the app, and what is cached
    // stays on screen meanwhile.
    const client = inject(QueryClient);
    void client.invalidateQueries({ queryKey: qk.hubAll() });
    void client.invalidateQueries({ queryKey: qk.openSessions() });
  }
}
