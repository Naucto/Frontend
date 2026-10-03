import { SlicePipe } from '@angular/common';
import type { OnInit } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  projectControllerRemove,
  projectControllerUpdate,
  projectControllerUploadProjectImage,
  type ProjectExResponseDto,
  type UpdateProjectDto,
} from '@naucto/api-client';
import { type Action, ACTIONS, KEYS } from '@naucto/engine';
import {
  ButtonDirective,
  DialogService,
  FieldComponent,
  HelpDotComponent,
  IconComponent,
  InputDirective,
  LabelComponent,
  NoticeComponent,
  PanelColumnComponent,
  ReadoutComponent,
  RelativeTimePipe,
  SectionComponent,
  SegmentedComponent,
  type SegmentOption,
  TagInputComponent,
  ToastService,
} from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';
import type * as Y from 'yjs';

import { unwrap } from '../../../core/api/api-errors';
import { FeaturesService } from '../../../core/config/features.service';
import { RuntimeHostService } from '../../../shared/game-screen/runtime-host.service';
import { PersonSearchComponent } from '../../../shared/person-search.component';
import { qk } from '../../../shared/queries/query-keys';
import { injectProjectImage, injectRelease } from '../../../shared/queries/releases.queries';
import type { PersonHit } from '../../../shared/queries/search.queries';
import { UserAvatarComponent } from '../../../shared/user-avatar.component';
import { ySignal, yTextField } from '../../../shared/yjs/y-signal';
import { PANEL_WIDTH } from '../state/editor-ui.store';
import { parseTags } from '../state/project-tags';
import { HostElectionService } from '../work-session/host-election.service';
import { SessionPresenceService } from '../work-session/session-presence.service';
import { SessionSaveService } from '../work-session/session-save.service';
import { WorkSessionService } from '../work-session/work-session.service';
import { addCollaborator } from './share.dialog';

// The `maxLength`s of `UpdateProjectDto` in the API's schema, not a house style: the field has to
// stop the typing rather than let a save fail on it. The generated client carries no constraints.
const NAME_MAX = 25;
const SUMMARY_MAX = 50;
const DESCRIPTION_MAX = 300;
const CONTROL_LABEL_MAX = 25;
type ProjectStatus = ProjectExResponseDto['status'];
type Monetization = ProjectExResponseDto['monetization'];

const COVER_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** GAME tab: what this thing is, who it's for, where it goes. */
@Component({
  selector: 'nc-game-tab-page',
  imports: [
    SlicePipe,
    FormsModule,
    TranslocoDirective,
    UserAvatarComponent,
    ButtonDirective,
    FieldComponent,
    HelpDotComponent,
    IconComponent,
    InputDirective,
    LabelComponent,
    NoticeComponent,
    PanelColumnComponent,
    ReadoutComponent,
    RelativeTimePipe,
    PersonSearchComponent,
    SectionComponent,
    SegmentedComponent,
    TagInputComponent,
  ],
  templateUrl: './game-tab.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class GameTabPage implements OnInit {
  protected readonly PANEL_WIDTH = PANEL_WIDTH;
  protected readonly features = inject(FeaturesService);
  protected readonly session = inject(WorkSessionService);
  protected readonly presence = inject(SessionPresenceService);
  protected readonly saves = inject(SessionSaveService);
  protected readonly election = inject(HostElectionService);
  /** Nobody already on the project is worth offering: the endpoint answers them with a 400. */
  protected readonly memberIds = computed(
    () => this.session.project()?.collaborators.map((collaborator) => collaborator.id) ?? [],
  );
  private readonly runtime = inject(RuntimeHostService);
  private readonly toasts = inject(ToastService);
  private readonly qc = inject(QueryClient);
  private readonly dialogs = inject(DialogService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  protected readonly nameMax = NAME_MAX;
  protected readonly summaryMax = SUMMARY_MAX;
  protected readonly descriptionMax = DESCRIPTION_MAX;

  protected readonly name = yTextField(this.session.doc.getText(KEYS.projectName));
  protected readonly summary = yTextField(this.session.doc.getText(KEYS.shortDescription));
  protected readonly description = yTextField(this.session.doc.getText(KEYS.longDescription));
  private readonly tagsRaw = yTextField(this.session.doc.getText(KEYS.projectTags));
  protected readonly tags = computed(() => parseTags(this.tagsRaw()));

  protected setTags(tags: string[]): void {
    this.tagsRaw.set(JSON.stringify(tags));
  }

  protected readonly controlLabelMax = CONTROL_LABEL_MAX;
  private readonly declared = ySignal(
    () => this.session.game.declaredActions,
    (cb) => {
      const meta = this.session.game.meta;
      const handler = (event: Y.YMapEvent<unknown>): void => {
        if (event.keysChanged.has('actions')) {
          cb();
        }
      };
      meta.observe(handler);
      return () => {
        meta.unobserve(handler);
      };
    },
  );
  /**
   * Labels being typed, shown over the document's until blur or Enter: the document trims, so
   * echoing it back mid-word would eat the space just typed.
   */
  private readonly controlDrafts = signal<Partial<Record<Action, string>>>({});
  private controlsTimer: ReturnType<typeof setTimeout> | undefined;
  protected readonly controls = computed(() => {
    const drafts = this.controlDrafts();
    const labels = new Map(
      this.declared().map((declaredAction) => [declaredAction.action, declaredAction.label]),
    );
    return ACTIONS.map((action) => ({ action, label: drafts[action] ?? labels.get(action) ?? '' }));
  });

  protected editControl(action: Action, label: string): void {
    this.controlDrafts.update((prevDrafts) => ({ ...prevDrafts, [action]: label }));
    clearTimeout(this.controlsTimer);
    this.controlsTimer = setTimeout(() => {
      this.writeControls();
    }, 300);
  }

  protected commitControls(): void {
    this.writeControls();
    this.controlDrafts.set({});
  }

  private writeControls(): void {
    clearTimeout(this.controlsTimer);
    this.controlsTimer = undefined;
    this.session.game.setDeclaredActions(this.controls());
  }

  protected readonly status = signal<ProjectStatus>('IN_PROGRESS');
  protected readonly monetization = signal<Monetization>('NONE');
  protected readonly price = signal<number | null>(null);
  protected readonly statuses = computed<SegmentOption<ProjectStatus>[]>(() => [
    {
      value: 'IN_PROGRESS',
      label: this.transloco.translate('editor.game.statusInProgress'),
      tone: 'orange',
    },
    { value: 'COMPLETED', label: this.transloco.translate('editor.game.statusCompleted') },
    { value: 'ARCHIVED', label: this.transloco.translate('editor.game.statusArchived') },
  ]);
  protected readonly monetizations = computed<SegmentOption<Monetization>[]>(() => [
    { value: 'NONE', label: this.transloco.translate('editor.game.monetizationNone') },
    { value: 'ADS', label: this.transloco.translate('editor.game.monetizationAds') },
    { value: 'PAID', label: this.transloco.translate('editor.game.monetizationPaid') },
  ]);
  protected readonly canPublish = computed(
    () => this.name().trim().length > 0 && this.summary().trim().length > 0,
  );

  /** The game this one was forked from, so the lineage can name it rather than number it. */
  protected readonly parent = injectRelease(() => this.session.project()?.forkedFromId ?? 0);

  protected readonly cover = injectProjectImage(() => this.session.id);
  protected readonly coverAccept = COVER_TYPES.join(',');

  constructor() {
    // A label still waiting on its debounce when the tab is left is owed to the document.
    inject(DestroyRef).onDestroy(() => {
      if (this.controlsTimer !== undefined) {
        this.writeControls();
      }
    });
  }

  ngOnInit(): void {
    const project = this.session.project();
    if (project) {
      this.status.set(project.status);
      this.monetization.set(project.monetization);
      this.price.set(project.price);
    }
  }

  protected setStatus(status: ProjectStatus | undefined): void {
    if (!status) {
      return;
    }
    this.status.set(status);
    void this.patch({ status });
  }
  protected setMonetization(monetization: Monetization | undefined): void {
    if (!monetization) {
      return;
    }
    this.monetization.set(monetization);
    void this.patch({ monetization });
  }
  protected commitPrice(): void {
    const price = this.price();
    if (price === null || price < 0) {
      this.price.set(this.session.project()?.price ?? null);
      return;
    }
    if (price !== this.session.project()?.price) {
      void this.patch({ price });
    }
  }

  private async patch(
    body: Pick<UpdateProjectDto, 'status' | 'monetization' | 'price'>,
  ): Promise<void> {
    const project = this.session.project();
    if (!project) {
      return;
    }
    try {
      unwrap(
        await projectControllerUpdate({
          path: { id: this.session.id },
          // The three texts go along with whatever changed, out of the editor's own copy rather than
          // the server's: the route asks for a whole project, and the words on this page are ahead of
          // the ones the server holds until the next save.
          body: {
            name: this.name() || project.name,
            shortDesc: this.summary() || project.shortDesc,
            longDesc: this.description() || project.longDesc,
            ...body,
          },
        }),
      );
      await this.saves.refreshProject();
    } catch (error) {
      this.toasts.show(
        error instanceof Error ? error.message : 'Could not update the game',
        'error',
      );
      const now = this.session.project() ?? project;
      this.status.set(now.status);
      this.monetization.set(now.monetization);
      this.price.set(now.price);
    }
  }

  protected async grabFrame(): Promise<void> {
    const rgba = this.runtime.screenshot();
    if (!rgba) {
      this.toasts.show(this.transloco.translate('editor.game.grabNeedsRun'), 'warning');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const width = Math.sqrt((rgba.length / 4) * (320 / 180));
    const img = new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, Math.round(width));
    const tmp = document.createElement('canvas');
    tmp.width = img.width;
    tmp.height = img.height;
    tmp.getContext('2d')?.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, 320, 180);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    if (blob) {
      await this.uploadBlob(blob);
    }
  }

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      await this.uploadBlob(file);
    }
    input.value = '';
  }

  protected async dropCover(event: DragEvent): Promise<void> {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file && COVER_TYPES.includes(file.type)) {
      await this.uploadBlob(file);
    }
  }

  private async uploadBlob(blob: Blob): Promise<void> {
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

  protected async invite(person: PersonHit): Promise<void> {
    try {
      await addCollaborator(this.session.id, person.username);
      await this.saves.refreshProject();
      this.toasts.show(
        this.transloco.translate('share.invited', { name: person.username }),
        'success',
      );
    } catch (error: unknown) {
      this.toasts.show(
        error instanceof Error ? error.message : this.transloco.translate('share.inviteFailed'),
        'error',
      );
    }
  }

  /** Only the creator may delete; the endpoint is behind a guard that answers 403 to everyone else. */
  protected readonly isCreator = computed(
    () => this.session.project()?.creator.id === this.session.myUserId,
  );

  protected async confirmDelete(): Promise<void> {
    const confirmed = await this.dialogs.confirmDanger({
      title: this.transloco.translate('editor.game.deleteConfirmTitle'),
      message: this.transloco.translate('editor.game.deleteConfirmHint'),
      confirmLabel: this.transloco.translate('editor.game.delete'),
    });
    if (confirmed) {
      await this.deleteGame();
    }
  }

  private async deleteGame(): Promise<void> {
    // Before the request, not after: the autosave interval is still running against a project that
    // is about to stop existing, and a save landing after the delete is a 404 in the console at
    // best.
    await this.session.close();
    try {
      unwrap(await projectControllerRemove({ path: { id: this.session.id } }));
    } catch {
      this.toasts.show(this.transloco.translate('editor.game.deleteFailed'), 'error');
      return;
    }
    await this.qc.invalidateQueries({ queryKey: qk.projectsAll() });
    await this.router.navigate(['/games']);
  }

  /**
   * Exports the document as a Yjs update, the same bytes the server stores, so the file needs no
   * format of its own.
   */
  protected exportGame(): void {
    const name = this.session.project()?.name ?? 'game';
    const file = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const url = URL.createObjectURL(this.session.snapshot());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${file || 'game'}.ncto`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
