import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { DialogService } from '@naucto/ui';

import {
  ResourceDialog,
  type ResourceDialogData,
  type ResourceDialogResult,
} from './resource.dialog';

interface CollectionEntry {
  readonly id: string;
  readonly name: string;
  readonly colour: number | null;
}

/** One of a game's collections — its sheets, its maps — and which entry of it is in hand. */
export interface Collection {
  list(): readonly CollectionEntry[];
  /**
   * Appends a nameless entry, like the first one: an entry is reached by its number, and a name is
   * something its author gives it when the number stops being enough.
   */
  add(): void;
  remove(id: string): void;
  describe(id: string, name: string, colour: number | null): void;
  selected(): string;
  select(id: string): void;
  /** Where the selection goes when its entry is removed and the list has nothing left to offer. */
  readonly fallbackId: string;
  /** The game's palette, since a colour slot means nothing without the colours it indexes. */
  palette(): readonly string[];
  /** Translation keys, written out whole so a search for one finds where it is used. */
  readonly keys: {
    dialog: string;
    deleteTitle: string;
    deleteMessage: string;
    deleteConfirm: string;
  };
}

/** What the strip of a collection's tabs does: choose, add, rename and recolour, remove. */
export function injectCollectionActions(collection: Collection): {
  choose(id: string | undefined): void;
  add(): void;
  describe(id: string): void;
  remove(id: string): Promise<void>;
} {
  const dialogs = inject(DialogService);
  const i18n = inject(TranslocoService);
  return {
    // The strip's value is optional because a tab list may be empty; a game's collection is not.
    choose(id) {
      if (id !== undefined) {
        collection.select(id);
      }
    },
    add() {
      collection.add();
      const added = collection.list().at(-1);
      if (added) {
        collection.select(added.id);
      }
    },
    describe(id) {
      const found = collection.list().find((entry) => entry.id === id);
      if (!found) {
        return;
      }
      dialogs
        .open<ResourceDialog, ResourceDialogData, ResourceDialogResult>(ResourceDialog, {
          data: {
            title: i18n.translate(collection.keys.dialog),
            confirmLabel: i18n.translate('editor.resource.save'),
            name: found.name,
            colour: found.colour,
            palette: collection.palette(),
            taken: collection.list().map((entry) => entry.name),
          },
        })
        .closed.subscribe((result) => {
          if (result) {
            collection.describe(id, result.name, result.colour);
          }
        });
    },
    async remove(id) {
      const confirmed = await dialogs.confirmDanger({
        title: i18n.translate(collection.keys.deleteTitle),
        message: i18n.translate(collection.keys.deleteMessage),
        confirmLabel: i18n.translate(collection.keys.deleteConfirm),
      });
      if (!confirmed) {
        return;
      }
      collection.remove(id);
      if (collection.selected() === id) {
        collection.select(collection.list()[0]?.id ?? collection.fallbackId);
      }
    },
  };
}
