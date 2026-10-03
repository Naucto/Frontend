import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { AuthStore } from '@app/core/auth/auth.store';
import { qk } from '@app/shared/queries/query-keys';
import { UserAvatarComponent } from '@app/shared/user-avatar.component';
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
  RelativeTimePipe,
  SkeletonComponent,
  ToastService,
} from '@naucto/ui';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';

const PAGE = 20;
const MAX_LEN = 500;

@Component({
  selector: 'nc-comments',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    RouterLink,
    TranslocoDirective,
    AvatarComponent,
    ButtonDirective,
    ChipComponent,
    IconComponent,
    InputDirective,
    LabelComponent,
    RelativeTimePipe,
    SkeletonComponent,
    UserAvatarComponent,
  ],
  templateUrl: './comments.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommentsComponent {
  readonly projectId = input.required<number>();
  readonly authorId = input<number | null>(null);
  protected readonly auth = inject(AuthStore);
  private readonly qc = inject(QueryClient);
  private readonly toasts = inject(ToastService);
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
    onSuccess: () => {
      this.draft = '';
      return this.refresh();
    },
    onError: (e: unknown) => {
      this.fail(e);
    },
  }));

  protected post(): void {
    const text = this.draft.trim();
    if (!text) return;
    this.posting.mutate(text);
  }

  protected async postReply(commentId: number): Promise<void> {
    const text = this.replyDraft.trim();
    if (!text) return;
    try {
      unwrap(
        await projectCommentControllerCreateReply({
          path: { projectId: this.projectId(), commentId },
          body: { content: text },
        }),
      );
    } catch (e) {
      this.fail(e);
      return;
    }
    this.replyDraft = '';
    this.replyTo.set(null);
    await this.refresh();
  }

  protected async remove(commentId: number): Promise<void> {
    try {
      unwrap(
        await projectCommentControllerDeleteComment({
          path: { projectId: this.projectId(), commentId },
        }),
      );
    } catch (e) {
      this.fail(e);
      return;
    }
    await this.refresh();
  }

  private fail(e: unknown): void {
    this.toasts.show(e instanceof Error ? e.message : String(e), 'error');
  }

  private async refresh(): Promise<void> {
    this.loaded.set([]);
    this.page.set(1);
    await this.qc.invalidateQueries({ queryKey: ['release', this.projectId(), 'comments'] });
  }
}
