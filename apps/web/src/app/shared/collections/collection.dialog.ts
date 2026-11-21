import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type CollectionDto, CollectionVisibility } from '@naucto/api-client';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  SegmentedComponent,
} from '@naucto/ui';

import {
  injectCreateCollection,
  injectUpdateCollection,
  limitOf,
} from '../queries/collections.queries';

export interface CollectionDialogData {
  /** The collection to edit; without one the dialog creates it. */
  collection?: Pick<CollectionDto, 'id' | 'title' | 'description' | 'visibility'>;
}

/**
 * Creates a collection, or edits one: its title, its description and who can open it. Closes with
 * the collection as the server stored it, or with nothing when it is backed out of.
 */
@Component({
  selector: 'nc-collection-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    InputDirective,
    SegmentedComponent,
  ],
  templateUrl: './collection.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionDialogComponent {
  protected readonly data = inject<CollectionDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<CollectionDto>>(DialogRef);
  private readonly i18n = inject(TranslocoService);
  private readonly create = injectCreateCollection();
  private readonly update = injectUpdateCollection();

  /** The API's own limits, so the fields stop where it would refuse. */
  protected readonly TITLE_MAX = 40;
  protected readonly DESCRIPTION_MAX = 280;

  protected readonly title = signal(this.data.collection?.title ?? '');
  protected readonly description = signal(this.data.collection?.description ?? '');
  protected readonly visibility = signal<CollectionVisibility>(
    this.data.collection?.visibility ?? 'PRIVATE',
  );
  protected readonly error = signal<string | null>(null);
  protected readonly saving = computed(() => this.create.isPending() || this.update.isPending());
  protected readonly options = computed(() =>
    Object.values(CollectionVisibility).map((value) => ({
      value,
      label: this.i18n.translate(`collections.visibility.${value}`),
    })),
  );

  protected async save(): Promise<void> {
    const body = {
      title: this.title().trim(),
      description: this.description().trim() || null,
      visibility: this.visibility(),
    };
    if (!body.title || this.saving()) {
      return;
    }
    this.error.set(null);
    try {
      const editing = this.data.collection;
      this.ref.close(
        editing
          ? await this.update.mutateAsync({ id: editing.id, patch: body })
          : await this.create.mutateAsync(body),
      );
    } catch (error: unknown) {
      const max = limitOf(error, 'COLLECTIONS_LIMIT');
      this.error.set(
        max === null
          ? this.i18n.translate('collections.dialog.failed')
          : this.i18n.translate('collections.dialog.limit', { n: max }),
      );
    }
  }
}
