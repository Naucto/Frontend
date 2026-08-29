import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectExResponseDto } from '@naucto/api-client';
import { AvatarComponent, ChipComponent, StatComponent } from '@naucto/ui';

import { GameCoverComponent } from './game-cover.component';

/** Hub card: cover, title, author chips, plays / likes / remixes. */
@Component({
  selector: 'nc-game-card',
  imports: [RouterLink, AvatarComponent, ChipComponent, GameCoverComponent, StatComponent],
  template: `
    <a [routerLink]="link()" [class]="cardClass()">
      <div class="relative aspect-video w-full">
        <nc-game-cover
          class="h-full w-full"
          [releaseId]="draft() ? null : game().id"
          [alt]="game().name"
          [label]="dense() ? undefined : 'No cover yet'"
          [iconSize]="dense() ? 12 : 48"
        />
      </div>
      <div [class]="dense() ? 'p-1' : 'p-1.5'">
        <div class="flex items-center gap-1">
          <span
            class="min-w-0 flex-1 truncate text-ink group-hover:text-gold-ink"
            [class]="dense() ? 'text-meta' : 'text-ui'"
          >
            {{ game().name }}
          </span>
          @if (draft()) {
            <nc-chip>Draft</nc-chip>
          }
        </div>
        <div class="mt-0.5 flex items-center gap-0.5">
          <nc-avatar
            [name]="game().creator.username"
            [id]="game().creator.id"
            [size]="14"
            class="mr-0.5"
          />
          <span class="label truncate">{{ game().creator.username }}</span>
          <!-- Collaborators overlap the way the design stacks them, then a +N for the rest. -->
          @for (c of stacked(); track c.id) {
            <nc-avatar [name]="c.username" [id]="c.id" [size]="14" overlap />
          }
          @if (extra()) {
            <span class="label ml-0.5 text-ink-4">+{{ extra() }}</span>
          }
        </div>
        <div class="mt-1 flex gap-2">
          <nc-stat icon="play" [value]="game().viewCount" />
          <nc-stat icon="heart" [value]="game().likes" tone="hot" />
          <nc-stat icon="git-branch" [value]="game().forkCount ?? 0" />
        </div>
      </div>
    </a>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameCardComponent {
  readonly game = input.required<ProjectExResponseDto>();
  protected readonly cardClass = computed(() =>
    [
      'group block overflow-hidden border border-line hover:border-line-strong focus-visible:outline-2',
      this.dense() ? 'rounded-sm bg-page' : 'rounded-md bg-raised',
    ].join(' '),
  );
  /** Draft cards link to the editor instead of the play page. */
  readonly draft = input(false);
  protected readonly link = computed(() =>
    this.draft() ? ['/edit', this.game().id] : ['/play', this.game().id],
  );
  /** Tighter type and padding for the sidebar lists on the play page. */
  readonly dense = input(false, { transform: booleanAttribute });

  /**
   * The author is already the swatch beside their name, so listing them again in the stack
   * rendered every solo game as "D DESIGNCHECK D".
   */
  private readonly others = computed(() =>
    this.game().collaborators.filter((c) => c.id !== this.game().creator.id),
  );
  protected readonly stacked = computed(() => this.others().slice(0, 2));
  protected readonly extra = computed(() => Math.max(0, this.others().length - 2));
}
