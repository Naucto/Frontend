import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  projectControllerRemoveClip,
  projectControllerUploadProjectImage,
} from '@naucto/api-client';
import {
  ChipComponent,
  DialogService,
  FieldComponent,
  formatBytes,
  HelpDotComponent,
  IconComponent,
  InputDirective,
  LabelComponent,
  MarkComponent,
  TagInputComponent,
  ToastService,
} from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';

import { unwrap } from '../../../core/api/api-errors';
import { frameToPng } from '../../../shared/game-screen/frame-to-png';
import { RuntimeHostService } from '../../../shared/game-screen/runtime-host.service';
import { qk } from '../../../shared/queries/query-keys';
import { injectProjectImage } from '../../../shared/queries/releases.queries';
import { SessionSaveService } from '../work-session/session-save.service';
import { WorkSessionService } from '../work-session/work-session.service';
import { CLIP_SECONDS, ClipRecorder } from './clip-recorder.service';
import { clock } from './clock';

// The `maxLength`s of `UpdateProjectDto` in the API's schema, not a house style: the field has to
// stop the typing rather than let a save fail on it. The generated client carries no constraints.
const NAME_MAX = 25;
const SUMMARY_MAX = 50;
const DESCRIPTION_MAX = 300;
const TAGS_MAX = 10;

const COVER_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** One action of the bar along the foot of a picture. */
const CELL =
  'flex flex-1 cursor-pointer items-center justify-center gap-0.75 font-ui text-label uppercase transition-colors duration-100 disabled:cursor-default';

/**
 * The Details tab: the cover and the clip as two blocks of one shape, then the words the game is
 * listed under. The cover's frame and the clip are both taken from the game running in the sidebar.
 */
@Component({
  selector: 'nc-game-details',
  imports: [
    FormsModule,
    TranslocoDirective,
    ChipComponent,
    FieldComponent,
    HelpDotComponent,
    IconComponent,
    InputDirective,
    LabelComponent,
    MarkComponent,
    TagInputComponent,
  ],
  templateUrl: './details.component.html',
  host: { class: '@container block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsComponent {
  readonly name = model.required<string>();
  readonly summary = model.required<string>();
  readonly description = model.required<string>();
  readonly tags = model.required<string[]>();

  protected readonly NAME_MAX = NAME_MAX;
  protected readonly SUMMARY_MAX = SUMMARY_MAX;
  protected readonly DESCRIPTION_MAX = DESCRIPTION_MAX;
  protected readonly TAGS_MAX = TAGS_MAX;
  protected readonly CLIP_SECONDS = CLIP_SECONDS;
  protected readonly CELL = CELL;
  protected readonly clock = clock;
  protected readonly formatBytes = formatBytes;
  protected readonly coverAccept = COVER_TYPES.join(',');

  protected readonly session = inject(WorkSessionService);
  protected readonly recorder = inject(ClipRecorder);
  private readonly saves = inject(SessionSaveService);
  private readonly runtime = inject(RuntimeHostService);
  private readonly toasts = inject(ToastService);
  private readonly qc = inject(QueryClient);
  private readonly dialogs = inject(DialogService);
  private readonly transloco = inject(TranslocoService);

  protected readonly cover = injectProjectImage(() => this.session.id);
  protected readonly clipUrl = computed(() => this.session.project()?.clipUrl ?? null);
  /** How long the stored clip runs, read off the clip itself. */
  protected readonly clipSeconds = signal<number | null>(null);
  /** To the nearest second: a clip stopped at the limit runs a few frames short of it. */
  protected readonly clipLength = computed(() => {
    const seconds = this.clipSeconds();
    return seconds === null ? null : clock(Math.round(seconds));
  });
  /** How far through its loop the stored clip is, 0 to 1. */
  protected readonly clipProgress = signal(0);
  protected readonly clipBytes = signal<number | null>(null);
  protected readonly secondsLeft = computed(() =>
    Math.ceil(CLIP_SECONDS - this.recorder.elapsed()),
  );
  private readonly live = viewChild<ElementRef<HTMLVideoElement>>('live');

  private async uploadCover(blob: Blob): Promise<void> {
    try {
      unwrap(
        await projectControllerUploadProjectImage({
          path: { id: this.session.id },
          body: { file: blob },
        }),
      );
    } catch (error) {
      this.toasts.show(
        error instanceof Error ? error.message : 'Could not update the cover',
        'error',
      );
      return;
    }
    // A card resolves its cover from the release's picture first and the draft's second, so
    // dropping only the draft's key leaves a published game showing its old cover everywhere it
    // is listed — for the length of that key's staleTime, on a screen you have already left.
    await Promise.all([
      this.qc.invalidateQueries({ queryKey: qk.projectImage(this.session.id) }),
      this.qc.invalidateQueries({ queryKey: qk.releaseImage(this.session.id) }),
    ]);
    this.toasts.show(this.transloco.translate('editor.game.coverUpdated'), 'success');
  }

  protected async grabFrame(): Promise<void> {
    const rgba = this.runtime.screenshot();
    if (!rgba) {
      this.toasts.show(this.transloco.translate('editor.game.grabNeedsRun'), 'warning');
      return;
    }
    const blob = await frameToPng(rgba);
    if (blob) {
      await this.uploadCover(blob);
    }
  }

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      await this.uploadCover(file);
    }
    input.value = '';
  }

  protected async dropCover(event: DragEvent): Promise<void> {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file && COVER_TYPES.includes(file.type)) {
      await this.uploadCover(file);
    }
  }

  /**
   * A recorded clip states no length until it has been played to its end, and answers `Infinity`
   * until then: seeking past the end makes the browser find it.
   */
  protected readLength(video: HTMLVideoElement): void {
    if (Number.isFinite(video.duration)) {
      this.clipSeconds.set(video.duration);
      return;
    }
    video.addEventListener(
      'durationchange',
      () => {
        if (Number.isFinite(video.duration)) {
          this.clipSeconds.set(video.duration);
          video.currentTime = 0;
        }
      },
      { once: true },
    );
    video.currentTime = Number.MAX_SAFE_INTEGER;
  }

  protected follow(video: HTMLVideoElement): void {
    const length = this.clipSeconds();
    this.clipProgress.set(length ? Math.min(1, video.currentTime / length) : 0);
  }

  protected async removeClip(): Promise<void> {
    const confirmed = await this.dialogs.confirmDanger({
      title: this.transloco.translate('editor.game.clip.deleteTitle'),
      message: this.transloco.translate('editor.game.clip.deleteHint'),
      confirmLabel: this.transloco.translate('editor.game.delete'),
    });
    if (!confirmed) {
      return;
    }
    this.recorder.issue.set(null);
    try {
      unwrap(await projectControllerRemoveClip({ path: { id: this.session.id } }));
      this.recorder.recordedBytes.set(null);
      await this.saves.refreshProject();
    } catch {
      this.recorder.issue.set('refused');
    }
  }

  constructor() {
    effect(() => {
      const video = this.live()?.nativeElement;
      if (video) {
        video.srcObject = this.recorder.stream();
      }
    });
    effect((onCleanup) => {
      const url = this.clipUrl();
      const recorded = untracked(this.recorder.recordedBytes);
      this.clipSeconds.set(null);
      this.clipProgress.set(0);
      this.clipBytes.set(recorded);
      if (!url || recorded !== null) {
        return;
      }
      // Asked of where the clip is stored, which may not let a page read its headers: the weight
      // is then left unsaid.
      const asked = new AbortController();
      onCleanup(() => {
        asked.abort();
      });
      fetch(url, { method: 'HEAD', signal: asked.signal })
        .then((answer) => {
          const bytes = Number(answer.headers.get('content-length'));
          if (answer.ok && bytes > 0) {
            this.clipBytes.set(bytes);
          }
        })
        .catch(() => undefined);
    });
  }
}
