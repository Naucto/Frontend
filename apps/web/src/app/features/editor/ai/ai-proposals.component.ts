import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { unwrap } from '@app/core/api/api-errors';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  aiControllerList,
  aiControllerPreview,
  aiControllerRevert,
  aiControllerReview,
  type AiProposalResponseDto,
} from '@naucto/api-client';
import {
  type AiDiff,
  diffGames,
  encodeState,
  type Game,
  gameFromState,
  SoundEngine,
  WebAudioBackend,
} from '@naucto/engine';
import { ButtonDirective, NoticeComponent, ToastService } from '@naucto/ui';

import type { WorkSessionService } from '../work-session/work-session.service';
import { renderResource } from './ai-preview';

interface Image {
  id: string;
  label: string;
  before: string | null;
  after: string | null;
}

/** Proposal review: every preview is the backend's own result for the current editor state. */
@Component({
  selector: 'nc-ai-proposals',
  imports: [TranslocoDirective, ButtonDirective, NoticeComponent],
  template: `
    <div *transloco="let t">
      <div class="mb-1 flex gap-1">
        <button ncButton variant="ghost" size="sm" [disabled]="busy()" (click)="refresh()">
          {{ t('ai.refreshProposals') }}
        </button>
      </div>
      @if (error()) {
        <nc-notice tone="danger" role="alert">{{ error() }}</nc-notice>
      }
      @for (proposal of proposals(); track proposal.id) {
        <article class="border-t border-line py-1.5" [attr.data-proposal]="proposal.id">
          <h3 class="text-ui text-ink">{{ proposal.title }}</h3>
          <p class="text-meta text-ink-2">{{ proposal.summary }}</p>
          <p class="label">{{ t('ai.status.' + proposal.status) }}</p>
          <div class="mt-0.5 flex flex-wrap gap-1">
            @if (proposal.status === 'PENDING') {
              <button
                ncButton
                variant="secondary"
                size="sm"
                [disabled]="busy()"
                (click)="preview(proposal)"
              >
                {{ t('ai.preview') }}
              </button>
              @if (selectedId() === proposal.id) {
                <button
                  ncButton
                  variant="primary"
                  size="sm"
                  [disabled]="busy()"
                  (click)="apply(proposal)"
                >
                  {{ t('ai.approveApply') }}
                </button>
              }
              <button
                ncButton
                variant="ghost"
                size="sm"
                [disabled]="busy()"
                (click)="reject(proposal)"
              >
                {{ t('ai.reject') }}
              </button>
            }
            @if (proposal.status === 'APPLIED' && proposal.inverse) {
              <button
                ncButton
                variant="secondary"
                size="sm"
                [disabled]="busy()"
                (click)="revert(proposal)"
              >
                {{ t('ai.revert') }}
              </button>
            }
            @if (selectedId() === proposal.id && hasSound(proposal)) {
              <button
                ncButton
                variant="secondary"
                size="sm"
                [disabled]="busy()"
                (click)="audition(proposal)"
              >
                {{ t('ai.audition') }}
              </button>
              <button ncButton variant="ghost" size="sm" (click)="stopAudition()">
                {{ t('ai.stopSound') }}
              </button>
            }
          </div>
          @if (selectedId() === proposal.id && diff(); as d) {
            <div class="mt-1 border border-line p-1" data-testid="ai-preview">
              @for (image of images(); track image.id) {
                <p class="label">{{ image.label }}</p>
                <div class="grid grid-cols-2 gap-1">
                  <figure>
                    <figcaption class="text-meta text-ink-3">{{ t('ai.before') }}</figcaption>
                    @if (image.before) {
                      <img
                        [src]="image.before"
                        [alt]="t('ai.before')"
                        class="w-full [image-rendering:pixelated]"
                      />
                    } @else {
                      <p class="text-meta">{{ t('ai.absent') }}</p>
                    }
                  </figure>
                  <figure>
                    <figcaption class="text-meta text-ink-3">{{ t('ai.after') }}</figcaption>
                    @if (image.after) {
                      <img
                        [src]="image.after"
                        [alt]="t('ai.after')"
                        class="w-full [image-rendering:pixelated]"
                      />
                    } @else {
                      <p class="text-meta">{{ t('ai.absent') }}</p>
                    }
                  </figure>
                </div>
              }
              @for (change of d.code; track change.id) {
                <p class="label">{{ t('ai.codeFile', { name: change.name }) }}</p>
                <div class="grid grid-cols-2 gap-1">
                  <pre class="max-h-64 overflow-auto border border-line p-1 text-meta">{{
                    change.before
                  }}</pre>
                  <pre class="max-h-64 overflow-auto border border-line p-1 text-meta">{{
                    change.after
                  }}</pre>
                </div>
              }
              @if (widened(d).length) {
                <nc-notice tone="warn" role="alert">
                  <p class="text-body">{{ t('ai.keys.widened', { count: widened(d).length }) }}</p>
                  <ul class="mt-0.5 ml-3 list-disc">
                    @for (path of widened(d); track path) {
                      <li class="text-meta">{{ path }}</li>
                    }
                  </ul>
                </nc-notice>
              }
              @for (change of listed(d); track change.key) {
                <p class="label">{{ change.key }}</p>
                <div class="grid grid-cols-2 gap-1">
                  <pre class="max-h-40 overflow-auto border border-line p-1 text-meta">{{
                    change.before || '—'
                  }}</pre>
                  <pre class="max-h-40 overflow-auto border border-line p-1 text-meta">{{
                    change.after || '—'
                  }}</pre>
                </div>
              }
            </div>
          }
        </article>
      } @empty {
        <p class="text-meta text-ink-3">{{ t('ai.empty') }}</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiProposalsComponent {
  readonly session = input.required<WorkSessionService>();
  protected readonly proposals = signal<AiProposalResponseDto[]>([]);
  protected readonly selectedId = signal('');
  protected readonly diff = signal<AiDiff | null>(null);
  protected readonly images = signal<Image[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private result: Game | null = null;
  private sound: SoundEngine | null = null;
  private audio: WebAudioBackend | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stopAudition();
      this.discardResult();
    });
    queueMicrotask(() => void this.refresh());
  }

  private get projectId(): number {
    return this.session().id;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
      // Re-read the list, because a failure here usually means the world moved underneath the
      // button: another person applied this proposal first, or the server refused it as stale.
      // Leaving the row as PENDING with a live Accept button would be a lie about its state.
      await this.load().catch(() => undefined);
    } finally {
      this.busy.set(false);
    }
  }

  /** The proposals as the server has them, without touching the busy flag or the error. */
  private load(): Promise<AiProposalResponseDto[]> {
    return aiControllerList({ path: { projectId: this.projectId } }).then(unwrap);
  }

  async refresh(): Promise<void> {
    await this.run(async () => {
      this.proposals.set(await this.load());
    });
  }

  private discardResult(): void {
    this.result?.doc.destroy();
    this.result = null;
  }

  protected async preview(proposal: AiProposalResponseDto): Promise<void> {
    this.selectedId.set('');
    this.diff.set(null);
    this.images.set([]);
    this.stopAudition();
    this.discardResult();
    await this.run(async () => {
      const game = this.session().game;
      const { result } = unwrap(
        await aiControllerPreview({
          path: { projectId: this.projectId, proposalId: proposal.id },
          body: { snapshot: encodeState(game.doc) },
        }),
      );
      const after = gameFromState(result);
      this.result = after;
      const diff = diffGames(game, after);
      this.diff.set(diff);
      this.images.set([
        ...diff.sheets.map((sheet) => ({
          id: `sheet:${sheet.id}`,
          label: `${sheet.name || sheet.id} · ${String(sheet.changed)} px`,
          before: renderResource(game, 'sheet', sheet.id),
          after: renderResource(after, 'sheet', sheet.id),
        })),
        ...diff.maps.map((map) => ({
          id: `map:${map.id}`,
          label: `${map.name || map.id} · ${String(map.changed)} tiles`,
          before: map.created ? null : renderResource(game, 'map', map.id),
          after: map.removed ? null : renderResource(after, 'map', map.id),
        })),
      ]);
      this.selectedId.set(proposal.id);
    });
  }

  /**
   * Declarations this proposal would give a client more of than it had. An undeclared path is
   * open, so dropping a declaration and clearing a write bit both widen, and a reviewer has to be
   * told which lines those are rather than left to infer it from two strings.
   */
  protected widened(diff: AiDiff): string[] {
    return diff.net.filter((n) => n.widened).map((n) => n.key);
  }

  protected listed(diff: AiDiff): { key: string; before: string; after: string }[] {
    return [
      // Multiplayer declarations first: they decide who may read a game's own state, and a change
      // that hands a client more than it had is the one to read twice.
      ...diff.net.map((n) => ({ key: n.key, before: n.before, after: n.after })),
      ...diff.sound,
      ...diff.catalog.map((c) => ({ key: `catalog:${c.id}`, before: c.before, after: c.after })),
      ...diff.levels.map((l) => ({ key: `level:${l.id}`, before: l.before, after: l.after })),
    ].slice(0, 200);
  }

  protected async apply(proposal: AiProposalResponseDto): Promise<void> {
    await this.run(async () => {
      this.stopAudition();
      // Nothing pauses: the change lands in the document you are already looking at, so the
      // list refreshes to say so rather than the page disappearing and coming back.
      const categories = await this.session().applyAiProposal(proposal.id, proposal.contentHash);
      this.selectedId.set('');
      this.proposals.set(await this.load());
      this.toasts.show(
        this.transloco.translate('ai.applied', { what: categories.join(', ') || '—' }),
        'success',
      );
    });
  }

  protected async reject(proposal: AiProposalResponseDto): Promise<void> {
    await this.run(async () => {
      unwrap(
        await aiControllerReview({
          path: { projectId: this.projectId, proposalId: proposal.id },
          body: { decision: 'REJECTED', contentHash: proposal.contentHash },
        }),
      );
      this.proposals.set(await this.load());
    });
  }

  protected async revert(proposal: AiProposalResponseDto): Promise<void> {
    await this.run(async () => {
      unwrap(
        await aiControllerRevert({ path: { projectId: this.projectId, proposalId: proposal.id } }),
      );
      this.proposals.set(await this.load());
    });
  }

  protected hasSound(proposal: AiProposalResponseDto): boolean {
    return this.soundOps(proposal).length > 0;
  }

  private soundOps(proposal: AiProposalResponseDto): { category: string; slot: number }[] {
    const operations: unknown = proposal.operations;
    if (!Array.isArray(operations)) return [];

    return operations.flatMap((raw: unknown) => {
      if (!raw || typeof raw !== 'object') return [];
      const op = raw as Record<string, unknown>;

      return op.kind === 'sound' && typeof op.slot === 'number' && typeof op.category === 'string'
        ? [{ category: op.category, slot: op.slot }]
        : [];
    });
  }

  stopAudition(): void {
    this.sound?.destroy();
    this.audio?.destroy();
    this.sound = null;
    this.audio = null;
  }

  /** Plays the validated result through Naucto's own synth, with the game's music underneath SFX. */
  protected async audition(proposal: AiProposalResponseDto): Promise<void> {
    const result = this.result;
    if (!result) return;
    await this.run(async () => {
      this.stopAudition();
      const audio = new WebAudioBackend();
      this.audio = audio;
      await audio.unlock();
      const sound = new SoundEngine(audio, result);
      this.sound = sound;
      const ops = this.soundOps(proposal);
      const music = ops.find((op) => op.category === 'MUSIC');
      const underneath = [...result.songs.keys()]
        .map(Number)
        .find((slot) => Number.isInteger(slot));
      if (music) sound.playMusic(music.slot, true, 0);
      else if (underneath !== undefined) sound.playMusic(underneath, true, 0);
      ops
        .filter((op) => op.category === 'SFX')
        .forEach((op, index) => {
          setTimeout(
            () => {
              this.sound?.playSfx(op.slot, undefined, 0, 1);
            },
            400 + index * 700,
          );
        });
    });
  }
}
