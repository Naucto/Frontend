import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  EmptyStateComponent,
  InputDirective,
  MarkComponent,
  NoticeComponent,
  RelativeTimePipe,
  SkeletonComponent,
  ToastService,
} from '@naucto/ui';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { unwrap } from '../../../core/api/api-errors';
import { AuthStore } from '../../../core/auth/auth.store';
import { FeaturesService } from '../../../core/config/features.service';
import { CommentBubbleComponent } from '../../../shared/comments/comment-bubble.component';
import { ContentFlagLauncher } from '../../../shared/moderation/content-flag-launcher.service';
import { GoodStandingAction } from '../../../shared/moderation/good-standing-action';
import { qk } from '../../../shared/queries/query-keys';

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
    EmptyStateComponent,
    InputDirective,
    MarkComponent,
    NoticeComponent,
    RelativeTimePipe,
    SkeletonComponent,
    CommentBubbleComponent,
  ],
  templateUrl: './comments.component.html',
  styleUrl: '../../../shared/comments/speech-tail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommentsComponent {
  readonly projectId = input.required<number>();
  readonly authorId = input<number | null>(null);
  protected readonly auth = inject(AuthStore);
  private readonly qc = inject(QueryClient);
  private readonly toasts = inject(ToastService);
  private readonly features = inject(FeaturesService);
  private readonly flags = inject(ContentFlagLauncher);
  private readonly standing = inject(GoodStandingAction);
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
    return [...this.loaded(), ...current].filter((comment) =>
      seen.has(comment.id) ? false : (seen.add(comment.id), true),
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
    onError: (error: unknown) => {
      this.fail(error);
    },
  }));

  protected post(): void {
    const text = this.draft.trim();
    if (!text) {
      return;
    }
    this.standing.run(() => {
      this.posting.mutate(text);
    });
  }

  protected postReply(commentId: number): void {
    const text = this.replyDraft.trim();
    if (!text) {
      return;
    }
    this.standing.run(() => {
      void this.sendReply(commentId, text);
    });
  }

  private async sendReply(commentId: number, text: string): Promise<void> {
    try {
      unwrap(
        await projectCommentControllerCreateReply({
          path: { projectId: this.projectId(), commentId },
          body: { content: text },
        }),
      );
    } catch (error) {
      this.fail(error);
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
    } catch (error) {
      this.fail(error);
      return;
    }
    await this.refresh();
  }

  /** A comment that still reads, written by someone else: nobody reports their own words. */
  protected canReport(comment: CommentResponseDto): boolean {
    return (
      this.features.moderation() &&
      comment.deleted !== true &&
      comment.author.id !== this.auth.userId()
    );
  }

  protected report(comment: CommentResponseDto): void {
    this.flags.report({
      targetType: 'COMMENT',
      targetId: comment.id,
      label: comment.content,
      author: {
        id: comment.author.id,
        name: comment.author.nickname ?? comment.author.username,
      },
    });
  }

  private fail(error: unknown): void {
    this.toasts.show(error instanceof Error ? error.message : String(error), 'error');
  }

  private async refresh(): Promise<void> {
    this.loaded.set([]);
    this.page.set(1);
    await this.qc.invalidateQueries({ queryKey: qk.commentsAll(this.projectId()) });
  }
}
