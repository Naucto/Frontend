import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { unwrap } from '@app/core/api/api-errors';
import { AuthStore } from '@app/core/auth/auth.store';
import { qk } from '@app/shared/queries/query-keys';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  type CommentResponseDto,
  projectCommentControllerCreateComment,
  projectCommentControllerCreateReply,
  projectCommentControllerDeleteComment,
  projectCommentControllerGetComments,
} from '@naucto/api-client';
import {
  AvatarComponent,
  ButtonDirective,
  ChipComponent,
  IconComponent,
  InputDirective,
  LabelComponent,
  SkeletonComponent,
} from '@naucto/ui';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';

const PAGE = 20;
const MAX_LEN = 500;

@Component({
  selector: 'nc-comments',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    TranslocoDirective,
    AvatarComponent,
    ButtonDirective,
    ChipComponent,
    IconComponent,
    InputDirective,
    LabelComponent,
    SkeletonComponent,
  ],
  template: `
    <section *transloco="let t">
      <div class="mb-2 flex items-center justify-between">
        <nc-label>{{ t('comments.title') }} · {{ total() }}</nc-label>
        <span class="label text-ink-4">{{ t('comments.newest') }}</span>
      </div>

      @if (auth.isAuthenticated()) {
        <form class="mb-3 flex gap-1" (ngSubmit)="post()">
          <nc-avatar [name]="auth.displayName()" [id]="auth.userId() ?? undefined" [size]="28" />
          <div class="flex-1">
            <textarea
              ncInput
              name="comment"
              rows="2"
              [maxlength]="maxLen"
              [(ngModel)]="draft"
              [placeholder]="t('comments.placeholder')"
            ></textarea>
            <div class="mt-0.5 flex items-center justify-between">
              <span class="text-label text-ink-4">{{ draft.length }} / {{ maxLen }}</span>
              <button
                ncButton
                variant="primary"
                size="sm"
                type="submit"
                [disabled]="!draft.trim() || posting.isPending()"
              >
                {{ t('comments.post') }}
              </button>
            </div>
          </div>
        </form>
      }

      <ul class="divide-y divide-line">
        @for (c of comments(); track c.id) {
          <li class="py-2">
            <ng-container *ngTemplateOutlet="item; context: { c: c, depth: 0 }" />
            @for (r of c.replies ?? []; track r.id) {
              <div class="mt-1 ml-4 border-l border-line pl-2">
                <ng-container *ngTemplateOutlet="item; context: { c: r, depth: 1 }" />
              </div>
            }
          </li>
        } @empty {
          @if (query.isError()) {
            <!-- "No comments yet" would be a claim about the conversation; we do not know. -->
            <li class="py-3 text-center text-body text-hot-ink">{{ t('comments.loadFailed') }}</li>
          } @else if (query.isPending()) {
            <li class="grid gap-1 py-3">
              <nc-skeleton height="0.9rem" width="35%" />
              <nc-skeleton height="0.75rem" width="80%" />
            </li>
          } @else {
            <li class="py-3 text-center text-body text-ink-3">{{ t('comments.empty') }}</li>
          }
        }
      </ul>
      @if (hasMore()) {
        <button ncButton variant="ghost" class="mt-2 w-full" (click)="loadMore()">
          {{ t('comments.loadMore') }}
        </button>
      }

      <ng-template #item let-c="c" let-depth="depth">
        <div class="flex items-start gap-1">
          <!-- The colour comes from the person, as nc-avatar's contract says. Pinning it to
               jade for the game's author and sky for everybody else spent two of the three
               reserved presence colours on a role, and painted every other commenter the same
               shade — five different people arrived wearing one chip. -->
          <nc-avatar [name]="c.author.username" [id]="c.author.id" [size]="depth ? 22 : 28" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1">
              <span class="text-ui text-ink">{{ c.author.nickname || c.author.username }}</span>
              @if (c.author.id === authorId()) {
                <nc-chip tone="gold">{{ t('comments.author') }}</nc-chip>
              }
              <span class="label text-ink-4">{{ ago(c.createdAt) }}</span>
              <span class="flex-1"></span>
              @if (depth === 0 && auth.isAuthenticated()) {
                <button
                  type="button"
                  class="label flex items-center gap-0.75 text-ink-3 hover:text-ink"
                  (click)="replyTo.set(replyTo() === c.id ? null : c.id)"
                >
                  <nc-icon name="corner-down-right" [size]="12" />
                  {{ t('comments.reply') }}
                </button>
              }
              @if (c.author.id === auth.userId() && !c.deleted) {
                <button
                  type="button"
                  class="label text-ink-3 hover:text-hot-ink"
                  (click)="remove(c.id)"
                >
                  {{ t('comments.delete') }}
                </button>
              }
            </div>
            <!-- Bound rather than interpolated: an interpolation on its own line leaves a space
                 either side of it once Angular collapses the template's own newlines, and
                 whitespace-pre-wrap then renders those, indenting every comment by one space.
                 Prettier reformats the tag freely (htmlWhitespaceSensitivity is "ignore"), so
                 writing it on one line does not survive. -->
            <p
              class="text-body whitespace-pre-wrap"
              [class.text-ink-4]="c.deleted"
              [class.text-ink-body]="!c.deleted"
              [textContent]="c.deleted ? t('comments.deleted') : c.content"
            ></p>
            @if (replyTo() === c.id) {
              <form class="mt-1 flex gap-1" (ngSubmit)="postReply(c.id)">
                <input
                  ncInput
                  name="reply"
                  [maxlength]="maxLen"
                  [(ngModel)]="replyDraft"
                  [placeholder]="t('comments.replyPlaceholder')"
                />
                <button
                  ncButton
                  variant="primary"
                  size="sm"
                  type="submit"
                  [disabled]="!replyDraft.trim()"
                >
                  {{ t('comments.post') }}
                </button>
              </form>
            }
          </div>
        </div>
      </ng-template>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommentsComponent {
  readonly projectId = input.required<number>();
  readonly authorId = input<number | null>(null);
  protected readonly auth = inject(AuthStore);
  private readonly qc = inject(QueryClient);
  protected readonly page = signal(1);
  protected readonly maxLen = MAX_LEN;
  protected draft = '';
  protected replyDraft = '';
  protected readonly replyTo = signal<number | null>(null);
  private readonly loaded = signal<CommentResponseDto[]>([]);

  protected readonly query = injectQuery(() => ({
    queryKey: qk.comments(this.projectId(), this.page()),
    queryFn: async () =>
      unwrap(
        await projectCommentControllerGetComments({
          path: { projectId: this.projectId() },
          query: { page: this.page(), limit: PAGE, sort: 'newest' },
        }),
      ),
  }));
  protected readonly total = computed(() => this.query.data()?.total ?? 0);
  protected readonly comments = computed(() => {
    const current = this.query.data()?.comments ?? [];
    const seen = new Set<number>();
    return [...this.loaded(), ...current].filter((c) =>
      seen.has(c.id) ? false : (seen.add(c.id), true),
    );
  });
  protected readonly hasMore = computed(() => this.comments().length < this.total());

  /**
   * Keep the pages already read before asking for the next one — the query only ever holds the
   * current page, so without this the thread would shrink back to one page on every click.
   */
  protected loadMore(): void {
    const current = this.query.data()?.comments ?? [];
    this.loaded.update((prev) => [...prev, ...current]);
    this.page.set(this.page() + 1);
  }

  protected readonly posting = injectMutation(() => ({
    mutationFn: async (content: string) =>
      unwrap(
        await projectCommentControllerCreateComment({
          path: { projectId: this.projectId() },
          body: { content },
        }),
      ),
    onSuccess: () => this.refresh(),
  }));

  protected post(): void {
    const text = this.draft.trim();
    if (!text) return;
    this.posting.mutate(text);
    this.draft = '';
  }

  protected async postReply(commentId: number): Promise<void> {
    const text = this.replyDraft.trim();
    if (!text) return;
    this.replyDraft = '';
    this.replyTo.set(null);
    unwrap(
      await projectCommentControllerCreateReply({
        path: { projectId: this.projectId(), commentId },
        body: { content: text },
      }),
    );
    await this.refresh();
  }

  protected async remove(commentId: number): Promise<void> {
    await projectCommentControllerDeleteComment({
      path: { projectId: this.projectId(), commentId },
    });
    await this.refresh();
  }

  protected ago(iso: string): string {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'now';
    if (s < 3600) return `${String(Math.floor(s / 60))} min ago`;
    if (s < 86400) return `${String(Math.floor(s / 3600))} h ago`;
    if (s < 86400 * 2) return 'yesterday';
    return `${String(Math.floor(s / 86400))} d ago`;
  }

  private async refresh(): Promise<void> {
    this.loaded.set([]);
    this.page.set(1);
    await this.qc.invalidateQueries({ queryKey: ['release', this.projectId(), 'comments'] });
  }
}
