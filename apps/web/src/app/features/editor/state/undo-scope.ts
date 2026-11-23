import { DestroyRef, inject, type Signal, signal } from '@angular/core';
import { LOCAL_ORIGIN } from '@naucto/engine';
import * as Y from 'yjs';

import { EditorModeService } from './editor-mode.service';

/**
 * One undo manager over the given Yjs scope, with the `canUndo`/`canRedo` signals and the
 * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts every tab wires the same way. Destroyed with the
 * injector. An undo writes the document itself, round the game's gate, so the shortcuts answer
 * nothing where the mode does not write.
 */
/**
 * How many steps the manager keeps, and the gate it lets go of the older ones through: dropping
 * a step splits the items it held, which is a transaction on the document.
 */
interface UndoLimit {
  steps: number;
  transact: (change: () => void) => boolean;
}

export function injectUndo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Y.UndoManager's own scope type.
  scope: Y.AbstractType<any>[],
  options: { limit?: UndoLimit } = {},
): {
  manager: Y.UndoManager;
  canUndo: Signal<boolean>;
  canRedo: Signal<boolean>;
  /** Handles the shortcut and returns true, or leaves the event alone and returns false. */
  onKey(event: KeyboardEvent): boolean;
} {
  const mode = inject(EditorModeService);
  const manager = new Y.UndoManager(scope, {
    trackedOrigins: new Set([LOCAL_ORIGIN, null]),
    captureTimeout: 300,
  });
  const canUndo = signal(false);
  const canRedo = signal(false);
  const onStack = (): void => {
    canUndo.set(manager.canUndo());
    canRedo.set(manager.canRedo());
  };
  manager.on('stack-item-added', onStack);
  const limit = options.limit;
  if (limit !== undefined) {
    manager.on('stack-item-added', (event: { type: 'undo' | 'redo' }) => {
      if (event.type === 'undo' && manager.undoStack.length > limit.steps) {
        const dropped = manager.undoStack.splice(0, manager.undoStack.length - limit.steps);
        limit.transact(() => {
          forget(manager, dropped);
        });
      }
    });
  }
  manager.on('stack-item-popped', onStack);
  manager.on('stack-cleared', onStack);
  inject(DestroyRef).onDestroy(() => {
    manager.destroy();
  });
  return {
    manager,
    canUndo: canUndo.asReadonly(),
    canRedo: canRedo.asReadonly(),
    onKey(event: KeyboardEvent): boolean {
      if (!mode.canWrite()) {
        return false;
      }
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          manager.redo();
        } else {
          manager.undo();
        }
        return true;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        manager.redo();
        return true;
      }
      return false;
    },
  };
}

function forget(manager: Y.UndoManager, dropped: Y.UndoManager['undoStack']): void {
  const doc = manager.doc;
  const inScope = (item: Y.Item): boolean =>
    manager.scope.some(
      (type) => type === doc || (type instanceof Y.AbstractType && Y.isParentOf(type, item)),
    );
  const transaction = doc._transaction;
  if (!transaction) {
    return;
  }
  for (const stackItem of dropped) {
    Y.iterateDeletedStructs(transaction, stackItem.deletions, (struct) => {
      if (!(struct instanceof Y.Item) || !inScope(struct)) {
        return;
      }
      let item: Y.Item | null = struct;
      while (item?.keep) {
        item.keep = false;
        item = item.parent instanceof Y.AbstractType ? item.parent._item : null;
      }
    });
    Y.tryGc(stackItem.deletions, doc.store, doc.gcFilter);
  }
}
