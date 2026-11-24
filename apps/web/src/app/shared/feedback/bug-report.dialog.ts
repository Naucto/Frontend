import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { OverlayContainer } from '@angular/cdk/overlay';
import { DOCUMENT } from '@angular/common';
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
  DisclosureComponent,
  FieldComponent,
  IconComponent,
  InputDirective,
  MediaActionDirective,
  MediaFrameComponent,
  NoticeComponent,
  SelectComponent,
} from '@naucto/ui';

import { violationsOf } from '../../core/api/api-errors';
import { APP_RELEASE } from '../../core/config/release';
import { ID_PATTERN } from '../../core/ids/ids';
import { pagePath } from '../../core/reports/page-path';
import { ActiveRuntimeService } from '../game-screen/active-runtime.service';
import { frameToPng } from '../game-screen/frame-to-png';
import { injectAttachScreenshot, injectSubmitBugReport } from '../queries/reports.queries';
import {
  canCaptureScreen,
  captureScreen,
  prepareScreenshot,
  ScreenshotUnreadableError,
} from './screenshot';

export const BUG_TITLE_MAX = 120;
export const BUG_DESCRIPTION_MAX = 4000;
const BUG_TITLE_MIN = 3;
const BUG_DESCRIPTION_MIN = 10;
const CONSOLE_LINES = 50;
const CONSOLE_LINE_MAX = 500;
/** Game frames are 320×180, and three times that is legible on a triage screen and still small. */
const FRAME_SCALE = 3;

export const BUG_CATEGORIES = Object.values(BugCategory);

/** Where the dialog was opened from, and what that place already knows. */
export interface BugReportData {
  category?: BugCategory;
  ratingId?: string;
  description?: string;
}

/** Whether the screenshot sent with the report, if any, was refused. */
export interface BugReportSent {
  screenshotRefused: boolean;
}

const SUBJECT = new RegExp(`^/(play|edit)/(${ID_PATTERN})(?:/|$)`);

/** The release or project a page is about, read from its path. */
export function subjectOf(path: string): { releaseId?: string; projectId?: string } {
  const [, page, id] = SUBJECT.exec(path) ?? [];
  if (!id) {
    return {};
  }
  return page === 'play' ? { releaseId: id } : { projectId: id };
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
 * attaches, every part of which is listed before it is sent. Closes with the report sent.
 */
@Component({
  selector: 'nc-bug-report-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    DisclosureComponent,
    FieldComponent,
    IconComponent,
    MediaActionDirective,
    MediaFrameComponent,
    InputDirective,
    NoticeComponent,
    SelectComponent,
  ],
  templateUrl: './bug-report.dialog.html',
  host: { '(paste)': 'onPaste($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BugReportDialog {
  protected readonly ref = inject<DialogRef<BugReportSent>>(DialogRef);
  private readonly data = inject<BugReportData | null>(DIALOG_DATA, { optional: true }) ?? {};
  private readonly transloco = inject(TranslocoService);
  private readonly overlay = inject(OverlayContainer);
  private readonly document = inject(DOCUMENT);
  private readonly runtime = inject(ActiveRuntimeService).current();
  private readonly submit = injectSubmitBugReport();
  private readonly attachScreenshot = injectAttachScreenshot();

  protected readonly titleMax = BUG_TITLE_MAX;
  protected readonly descriptionMax = BUG_DESCRIPTION_MAX;
  protected readonly route = pagePath(this.document.location.pathname);
  private readonly subject = subjectOf(this.route);

  private readonly categoryLabels = toSignal(
    this.transloco.selectTranslateObject<Record<BugCategory, string>>('feedback.categories'),
  );
  protected readonly categories = computed<{ value: BugCategory; label: string }[]>(() =>
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

  protected readonly pending = computed(
    () => this.submit.isPending() || this.attachScreenshot.isPending(),
  );
  protected readonly failed = signal<string | null>(null);

  protected readonly context: BugContextDto = this.buildContext();
  protected readonly contextRows = computed(() => this.describeContext());
  protected readonly showIncluded = signal(false);

  protected readonly valid = computed(
    () =>
      this.title().trim().length >= BUG_TITLE_MIN &&
      this.description().trim().length >= BUG_DESCRIPTION_MIN,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.revokePreview();
    });
  }

  /** The running game's frame, kept as a PNG so every pixel stays exact. */
  protected async useFrame(): Promise<void> {
    const rgba = this.runtime?.screenshot();
    if (!rgba) {
      return;
    }
    const blob = await frameToPng(rgba, FRAME_SCALE);
    if (blob) {
      this.show(blob);
    }
  }

  protected async captureScreen(): Promise<void> {
    const container = this.overlay.getContainerElement();
    try {
      const blob = await captureScreen(this.document, (hidden) => {
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
    let id: string;
    try {
      ({ id } = await this.submit.mutateAsync({
        category: this.category(),
        title: this.title().trim(),
        description: this.description().trim(),
        route: this.route,
        appRelease: APP_RELEASE,
        ...this.subject,
        ...(this.data.ratingId === undefined ? {} : { ratingId: this.data.ratingId }),
        context: this.context,
      }));
    } catch (error) {
      this.failed.set(
        this.transloco.translate(
          violationsOf(error).length > 0 ? 'feedback.bug.invalid' : 'feedback.bug.failed',
        ),
      );
      return;
    }
    const screenshot = this.screenshot();
    let screenshotRefused = false;
    if (screenshot) {
      try {
        await this.attachScreenshot.mutateAsync({ id, screenshot });
      } catch {
        screenshotRefused = true;
      }
    }
    this.ref.close({ screenshotRefused });
  }

  protected async attach(image: Blob): Promise<void> {
    this.screenshotError.set(null);
    this.preparing.set(true);
    try {
      this.show(await prepareScreenshot(image));
    } catch (error) {
      if (error instanceof ScreenshotUnreadableError) {
        this.screenshotError.set(this.transloco.translate('feedback.bug.screenshotUnreadable'));
      }
    } finally {
      this.preparing.set(false);
    }
  }

  private show(image: Blob): void {
    this.revokePreview();
    this.screenshotError.set(null);
    this.screenshot.set(image);
    this.preview.set(URL.createObjectURL(image));
  }

  private revokePreview(): void {
    const url = this.preview();
    if (url) {
      URL.revokeObjectURL(url);
      this.preview.set(null);
    }
  }

  private buildContext(): BugContextDto {
    const view = this.document.defaultView;
    const error = this.runtime?.error();
    const lines = (this.runtime?.lines() ?? [])
      .slice(-CONSOLE_LINES)
      .map((line) => `[${line.level}] ${line.text}`.slice(0, CONSOLE_LINE_MAX));
    const where = error?.file
      ? `${error.file}${error.line === undefined ? '' : `:${String(error.line)}`}`
      : '';
    const engineError = error
      ? [where, `${error.phase}: ${error.message}`, error.traceback ?? '']
          .filter(Boolean)
          .join('\n')
          .slice(0, BUG_DESCRIPTION_MAX)
      : undefined;
    return {
      viewport: `${String(view?.innerWidth ?? 0)}x${String(view?.innerHeight ?? 0)}`,
      language: (view?.navigator.language ?? '').slice(0, 35),
      ...(engineError ? { engineError } : {}),
      ...(lines.length > 0 ? { console: lines } : {}),
    };
  }

  private describeContext(): { label: string; value: string; identifier?: boolean }[] {
    const label = (key: string): string => this.transloco.translate(`feedback.bug.included.${key}`);
    const rows = [
      { label: label('page'), value: this.route },
      { label: label('browser'), value: label('browserValue') },
      { label: label('viewport'), value: this.context.viewport ?? '' },
      { label: label('language'), value: this.context.language ?? '' },
      { label: label('release'), value: APP_RELEASE, identifier: true },
    ];
    if (this.subject.releaseId !== undefined) {
      rows.push({ label: label('game'), value: this.subject.releaseId, identifier: true });
    }
    if (this.subject.projectId !== undefined) {
      rows.push({ label: label('project'), value: this.subject.projectId, identifier: true });
    }
    if (this.context.engineError) {
      rows.push({ label: label('engineError'), value: this.context.engineError, identifier: true });
    }
    if (this.context.console) {
      rows.push({
        label: label('console'),
        value: this.transloco.translate('feedback.bug.included.consoleLines', {
          count: this.context.console.length,
        }),
        identifier: true,
      });
    }
    return rows;
  }
}
