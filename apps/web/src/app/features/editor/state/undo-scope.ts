import { DestroyRef, inject, type Signal, signal } from '@angular/core';
import { LOCAL_ORIGIN } from '@naucto/engine';
import * as Y from 'yjs';

/**
 * One undo manager over the given Yjs scope, with the `canUndo`/`canRedo` signals and the
 * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts every tab wires the same way. Destroyed with the
 * injector.
 */
export function injectUndo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Y.UndoManager's own scope type.
  scope: Y.AbstractType<any>[],
  options: { limit?: number } = {},
): {
  manager: Y.UndoManager;
  canUndo: Signal<boolean>;
  canRedo: Signal<boolean>;
  /** Handles the shortcut and returns true, or leaves the event alone and returns false. */
  onKey(event: KeyboardEvent): boolean;
} {
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
      if (event.type === 'undo' && manager.undoStack.length > limit) {
        forget(manager, manager.undoStack.splice(0, manager.undoStack.length - limit));
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
  doc.transact((transaction) => {
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
  });
}
