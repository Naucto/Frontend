import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  projectControllerRemove,
  projectControllerUpdate,
  type ProjectExResponseDto,
  type UpdateProjectDto,
} from '@naucto/api-client';
import {
  ButtonDirective,
  ChipComponent,
  DialogService,
  HelpDotComponent,
  InputDirective,
  MarkComponent,
  PanelColumnComponent,
  ReadoutComponent,
  SectionComponent,
  SegmentedComponent,
  type SegmentOption,
  ToastService,
} from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';

import { unwrap } from '../../../core/api/api-errors';
import { FeaturesService } from '../../../core/config/features.service';
import { PersonSearchComponent } from '../../../shared/person-search.component';
import { qk } from '../../../shared/queries/query-keys';
import { injectRelease } from '../../../shared/queries/releases.queries';
import type { PersonHit } from '../../../shared/queries/search.queries';
import { UserAvatarComponent } from '../../../shared/user-avatar.component';
import { EditorRuntimeService } from '../state/editor-runtime.service';
import { PANEL_WIDTH } from '../state/editor-ui.store';
import { HostElectionService } from '../work-session/host-election.service';
import { SessionPresenceService } from '../work-session/session-presence.service';
import { SessionSaveService } from '../work-session/session-save.service';
import { WorkSessionService } from '../work-session/work-session.service';
import { CLIP_SECONDS, ClipRecorder } from './clip-recorder.service';
import { clock } from './clock';
import { addCollaborator } from './share.dialog';

type ProjectStatus = ProjectExResponseDto['status'];
type Monetization = ProjectExResponseDto['monetization'];

/**
 * The GAME tab's sidebar: the running game and its transport, then what publishing the game takes,
 * its status, who is in the session and where it comes from. The game is the editor's one runtime,
 * lent to this panel while the tab is open.
 */
@Component({
  selector: 'nc-game-publishing',
  imports: [
    FormsModule,
    TranslocoDirective,
    UserAvatarComponent,
    ButtonDirective,
    ChipComponent,
    HelpDotComponent,
    InputDirective,
    MarkComponent,
    PanelColumnComponent,
    PersonSearchComponent,
    ReadoutComponent,
    SectionComponent,
    SegmentedComponent,
  ],
  templateUrl: './publishing.component.html',
  host: {
    class: 'flex min-h-0 flex-col border-l-3 border-line bg-panel',
    '[style.width.px]': 'PANEL_WIDTH',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublishingComponent {
  /** The name and the summary as the page edits them, ahead of the ones the server holds. */
  readonly name = input.required<string>();
  readonly summary = input.required<string>();
  readonly description = input.required<string>();

  protected readonly PANEL_WIDTH = PANEL_WIDTH;
  protected readonly CLIP_SECONDS = CLIP_SECONDS;
  protected readonly clock = clock;
  protected readonly features = inject(FeaturesService);
  protected readonly session = inject(WorkSessionService);
  protected readonly presence = inject(SessionPresenceService);
  protected readonly election = inject(HostElectionService);
  protected readonly recorder = inject(ClipRecorder);
  private readonly saves = inject(SessionSaveService);
  private readonly editorRuntime = inject(EditorRuntimeService);
  private readonly toasts = inject(ToastService);
  private readonly qc = inject(QueryClient);
  private readonly dialogs = inject(DialogService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly screenSlot = viewChild<ElementRef<HTMLElement>>('screenSlot');

  /** Nobody already on the project is worth offering: the endpoint answers them with a 400. */
  protected readonly memberIds = computed(
    () => this.session.project()?.collaborators.map((collaborator) => collaborator.id) ?? [],
  );
  /** Only the creator may delete; the endpoint is behind a guard that answers 403 to everyone else. */
  protected readonly isCreator = computed(
    () => this.session.project()?.creator.id === this.session.myUserId,
  );
  /** The game this one was forked from, so the lineage can name it rather than number it. */
  protected readonly parent = injectRelease(() => this.session.project()?.forkedFromId ?? 0);

  protected readonly status = linkedSignal<ProjectStatus>(
    () => this.session.project()?.status ?? 'IN_PROGRESS',
  );
  protected readonly monetization = linkedSignal<Monetization>(
    () => this.session.project()?.monetization ?? 'NONE',
  );
  protected readonly price = linkedSignal<number | null>(
    () => this.session.project()?.price ?? null,
  );
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

  protected async confirmDelete(): Promise<void> {
    const confirmed = await this.dialogs.confirmDanger({
      title: this.transloco.translate('editor.game.deleteConfirmTitle'),
      message: this.transloco.translate('editor.game.deleteConfirmHint'),
      confirmLabel: this.transloco.translate('editor.game.delete'),
    });
    if (!confirmed) {
      return;
    }
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

  constructor() {
    effect((onCleanup) => {
      const slot = this.screenSlot()?.nativeElement;
      if (!slot) {
        return;
      }
      this.editorRuntime.screenSlot.set(slot);
      onCleanup(() => {
        this.editorRuntime.screenSlot.set(null);
      });
    });
  }
}
