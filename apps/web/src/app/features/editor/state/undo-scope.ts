import { DestroyRef, inject, type Signal, signal } from '@angular/core';
import { LOCAL_ORIGIN } from '@naucto/engine';
import * as Y from 'yjs';

/**
 * One undo manager over the given Yjs scope, with the `canUndo`/`canRedo` signals and the
 * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts every tab wires the same way. Destroyed with the
 * injector.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Y.UndoManager's own scope type.
export function injectUndo(scope: Y.AbstractType<any>[]): {
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
