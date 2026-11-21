import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import type { CollectionDto, MyCollectionDto } from '@naucto/api-client';
import {
  ButtonDirective,
  CheckboxComponent,
  ChipComponent,
  DialogService,
  IconComponent,
  OptionDirective,
  PopoverDirective,
  PopoverPanelComponent,
  ToastService,
} from '@naucto/ui';

import { AuthStore } from '../../core/auth/auth.store';
import { SignedInAction } from '../../shared/auth/signed-in-action';
import {
  CollectionDialogComponent,
  type CollectionDialogData,
} from '../../shared/collections/collection.dialog';
import { VisibilityChipComponent } from '../../shared/collections/visibility-chip.component';
import {
  injectMyCollections,
  injectSetInCollection,
  limitOf,
} from '../../shared/queries/collections.queries';

/**
 * The game page's way into the reader's collections: a button that says how many of them hold the
 * game and opens them as a checklist, where a tick adds the game and an untick takes it out, at
 * once. A reader with no account is asked to sign in first.
 */
@Component({
  selector: 'nc-add-to-collection',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    CheckboxComponent,
    ChipComponent,
    IconComponent,
    OptionDirective,
    PopoverDirective,
    PopoverPanelComponent,
    VisibilityChipComponent,
  ],
  templateUrl: './add-to-collection.component.html',
  host: { class: 'grid' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddToCollectionComponent {
  readonly projectId = input.required<number>();

  protected readonly auth = inject(AuthStore);
  private readonly signedIn = inject(SignedInAction);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly i18n = inject(TranslocoService);

  protected readonly mine = injectMyCollections(() => this.projectId());
  private readonly membership = injectSetInCollection();

  protected readonly open = signal(false);
  protected readonly holding = computed(
    () => (this.mine.data() ?? []).filter((collection) => collection.contains).length,
  );

  /** Signing in swaps the button for the one that holds the checklist, which then opens. */
  protected signIn(): void {
    this.signedIn.run(() => {
      this.open.set(true);
    });
  }

  protected async set(
    collection: Pick<MyCollectionDto, 'id' | 'title'>,
    holds: boolean,
  ): Promise<void> {
    try {
      await this.membership.mutateAsync({
        id: collection.id,
        projectId: this.projectId(),
        holds,
      });
    } catch (error: unknown) {
      const max = limitOf(error, 'COLLECTION_GAMES_LIMIT');
      this.toasts.show(
        max === null
          ? this.i18n.translate('collections.add.failed', { title: collection.title })
          : this.i18n.translate('collections.add.full', { title: collection.title, n: max }),
        'error',
      );
    }
  }

  protected create(): void {
    this.dialogs
      .open<CollectionDialogComponent, CollectionDialogData, CollectionDto>(
        CollectionDialogComponent,
        { width: '520px', data: {} },
      )
      .closed.subscribe((created) => {
        if (created) {
          void this.set(created, true);
        }
      });
  }
}
