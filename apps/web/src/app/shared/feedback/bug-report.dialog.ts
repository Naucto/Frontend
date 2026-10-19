import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { OverlayContainer } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { BugCategory, type BugContextDto } from '@naucto/api-client';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  IconComponent,
  InputDirective,
  NoticeComponent,
  SegmentedComponent,
  type SegmentOption,
  ToastService,
} from '@naucto/ui';

import { violationsOf } from '../../core/api/api-errors';
import { AppConfigService } from '../../core/config/app-config';
import { crashRoute } from '../../core/crash/crash-reporter.service';
import { ActiveRuntimeService } from '../game-screen/active-runtime.service';
import { frameToPng } from '../game-screen/frame-to-png';
import { injectSubmitBugReport } from '../queries/feedback.queries';
import {
  canCaptureScreen,
  captureScreen,
  prepareScreenshot,
  ScreenshotTooLargeError,
} from './screenshot';

export const BUG_TITLE_MAX = 120;
export const BUG_DESCRIPTION_MAX = 4000;
const BUG_TITLE_MIN = 3;
const BUG_DESCRIPTION_MIN = 10;
const CONSOLE_LINES = 50;
const CONSOLE_LINE_MAX = 500;
/** Game frames are 320×180; three times that is legible on a triage screen and still small. */
const FRAME_SCALE = 3;

export const BUG_CATEGORIES = Object.values(BugCategory);

/** Where the dialog was opened from, and what that place already knows. */
export interface BugReportData {
  category?: BugCategory;
  ratingId?: number;
  description?: string;
  /** The app error the report follows, as its name, message and stack. */
  appError?: string;
  /** Start with the running game's frame attached. */
  attachFrame?: boolean;
}

/** The release or project a page is about, read from its path. */
export function subjectOf(path: string): { releaseId?: number; projectId?: number } {
  const play = /^\/play\/(\d+)/.exec(path);
  if (play?.[1]) {
    return { releaseId: Number(play[1]) };
  }
  const edit = /^\/edit\/(\d+)/.exec(path);
  return edit?.[1] ? { projectId: Number(edit[1]) } : {};
}

/** The category a report opened on this page most likely belongs to. */
export function categoryFor(path: string): BugCategory {
  if (path.startsWith('/edit/')) {
    return BugCategory.EDITOR;
  }
  if (path.startsWith('/play/')) {
    return BugCategory.GAMEPLAY;
  }
  return BugCategory.OTHER;
}

/**
 * A bug report: what it is about, what happened, an optional screenshot, and the context the page
 * attaches, every part of which is listed before it is sent. Closes with the report's id.
 */
@Component({
  selector: 'nc-bug-report-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    IconComponent,
    InputDirective,
    NoticeComponent,
    SegmentedComponent,
  ],
  templateUrl: './bug-report.dialog.html',
  host: { '(paste)': 'onPaste($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BugReportDialog {
  protected readonly ref = inject<DialogRef<number>>(DialogRef);
  private readonly data = inject<BugReportData | null>(DIALOG_DATA, { optional: true }) ?? {};
  private readonly transloco = inject(TranslocoService);
  private readonly toasts = inject(ToastService);
  private readonly overlay = inject(OverlayContainer);
  private readonly config = inject(AppConfigService);
  private readonly runtime = inject(ActiveRuntimeService).current();
  private readonly submit = injectSubmitBugReport();

  protected readonly titleMax = BUG_TITLE_MAX;
  protected readonly descriptionMax = BUG_DESCRIPTION_MAX;
  protected readonly route = crashRoute(location.pathname);
  private readonly subject = subjectOf(this.route);

  private readonly categoryLabels = toSignal(
    this.transloco.selectTranslateObject<Record<BugCategory, string>>('feedback.categories'),
  );
  protected readonly categories = computed<SegmentOption<BugCategory>[]>(() =>
    BUG_CATEGORIES.map((value) => ({ value, label: this.categoryLabels()?.[value] ?? value })),
  );
  protected readonly category = signal<BugCategory>(this.data.category ?? categoryFor(this.route));
  protected readonly title = signal('');
  protected readonly description = signal(this.data.description ?? '');

  protected readonly screenshot = signal<Blob | null>(null);
  protected readonly preview = signal<string | null>(null);
  protected readonly screenshotError = signal<string | null>(null);
  protected readonly preparing = signal(false);
  protected readonly canCapture = canCaptureScreen();
  protected readonly hasFrame = this.runtime !== null && this.runtime.state() !== 'idle';

  protected readonly pending = this.submit.isPending;
  protected readonly failed = signal<string | null>(null);

  protected readonly context: BugContextDto = this.buildContext();
  protected readonly contextRows = computed(() => this.describeContext());

  protected readonly valid = computed(
    () =>
      this.title().trim().length >= BUG_TITLE_MIN &&
      this.description().trim().length >= BUG_DESCRIPTION_MIN,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.revokePreview();
    });
    if (this.data.attachFrame && this.hasFrame) {
      void this.useFrame();
    }
  }

  protected async useFrame(): Promise<void> {
    const rgba = this.runtime?.screenshot();
    if (!rgba) {
      return;
    }
    const blob = await frameToPng(rgba, FRAME_SCALE);
    if (blob) {
      await this.attach(blob);
    }
  }

  protected async captureScreen(): Promise<void> {
    const container = this.overlay.getContainerElement();
    try {
      const blob = await captureScreen((hidden) => {
        container.style.visibility = hidden ? 'hidden' : '';
      });
      if (blob) {
        await this.attach(blob);
      }
    } catch {
      // The person declined to share their screen. Nothing is attached and nothing is wrong.
    }
  }

  protected async pickFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      await this.attach(file);
    }
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const file = [...(event.dataTransfer?.files ?? [])].find((item) =>
      item.type.startsWith('image/'),
    );
    if (file) {
      await this.attach(file);
    }
  }

  protected async onPaste(event: ClipboardEvent): Promise<void> {
    const file = [...(event.clipboardData?.items ?? [])]
      .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
      ?.getAsFile();
    if (file) {
      event.preventDefault();
      await this.attach(file);
    }
  }

  protected removeScreenshot(): void {
    this.revokePreview();
    this.screenshot.set(null);
    this.screenshotError.set(null);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void this.send();
    }
  }

  protected async send(): Promise<void> {
    if (!this.valid() || this.pending() || this.preparing()) {
      return;
    }
    this.failed.set(null);
    const screenshot = this.screenshot();
    try {
      const { id } = await this.submit.mutateAsync({
        category: this.category(),
        title: this.title().trim(),
        description: this.description().trim(),
        route: this.route,
        ...this.subject,
        ...(this.data.ratingId === undefined ? {} : { ratingId: this.data.ratingId }),
        context: JSON.stringify(this.context),
        ...(screenshot ? { screenshot } : {}),
      });
      this.toasts.show(this.transloco.translate('feedback.bug.sent', { id }), 'success');
      this.ref.close(id);
    } catch (error) {
      const violations = violationsOf(error);
      this.failed.set(
        violations.length > 0
          ? this.transloco.translate('feedback.bug.invalid')
          : this.transloco.translate('feedback.bug.failed'),
      );
    }
  }

  private async attach(image: Blob): Promise<void> {
    this.screenshotError.set(null);
    this.preparing.set(true);
    try {
      const prepared = await prepareScreenshot(image);
      this.revokePreview();
      this.screenshot.set(prepared);
      this.preview.set(URL.createObjectURL(prepared));
    } catch (error) {
      this.screenshotError.set(
        this.transloco.translate(
          error instanceof ScreenshotTooLargeError
            ? 'feedback.bug.screenshotTooLarge'
            : 'feedback.bug.screenshotUnreadable',
        ),
      );
    } finally {
      this.preparing.set(false);
    }
  }

  private revokePreview(): void {
    const url = this.preview();
    if (url) {
      URL.revokeObjectURL(url);
      this.preview.set(null);
    }
  }

  private buildContext(): BugContextDto {
    const release = this.config.config().release;
    const error = this.runtime?.error();
    const lines = (this.runtime?.lines() ?? [])
      .slice(-CONSOLE_LINES)
      .map((line) => `[${line.level}] ${line.text}`.slice(0, CONSOLE_LINE_MAX));
    const engineError = error
      ? [
          `${error.file ? `${error.file}${error.line === undefined ? '' : `:${String(error.line)}`} · ` : ''}${error.phase}: ${error.message}`,
          error.traceback ?? '',
        ]
          .filter(Boolean)
          .join('\n')
          .slice(0, BUG_DESCRIPTION_MAX)
      : undefined;
    return {
      viewport: `${String(window.innerWidth)}x${String(window.innerHeight)}`,
      language: navigator.language.slice(0, 35),
      ...(release ? { appRelease: release } : {}),
      ...(engineError ? { engineError } : {}),
      ...(this.data.appError ? { appError: this.data.appError.slice(0, BUG_DESCRIPTION_MAX) } : {}),
      ...(lines.length > 0 ? { console: lines } : {}),
    };
  }

  private describeContext(): { label: string; value: string }[] {
    const label = (key: string): string => this.transloco.translate(`feedback.bug.included.${key}`);
    const rows = [
      { label: label('page'), value: this.route },
      { label: label('browser'), value: label('browserValue') },
      { label: label('viewport'), value: this.context.viewport ?? '' },
      { label: label('language'), value: this.context.language ?? '' },
    ];
    if (this.context.appRelease) {
      rows.push({ label: label('release'), value: this.context.appRelease });
    }
    if (this.subject.releaseId !== undefined) {
      rows.push({ label: label('game'), value: `#${String(this.subject.releaseId)}` });
    }
    if (this.subject.projectId !== undefined) {
      rows.push({ label: label('project'), value: `#${String(this.subject.projectId)}` });
    }
    if (this.context.engineError) {
      rows.push({ label: label('engineError'), value: this.context.engineError });
    }
    if (this.context.appError) {
      rows.push({ label: label('appError'), value: this.context.appError });
    }
    if (this.context.console) {
      rows.push({
        label: label('console'),
        value: this.transloco.translate('feedback.bug.included.consoleLines', {
          count: this.context.console.length,
        }),
      });
    }
    return rows;
  }
}
