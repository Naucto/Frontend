import { computed } from '@angular/core';
import {
  type Action,
  type ActionBindings,
  DEFAULT_BINDINGS,
  type GamepadButtonRef,
} from '@naucto/engine';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { readJson, STORAGE_KEYS, writeJson } from '../storage/local-storage';

interface InputBindingsState {
  bindings: ActionBindings;
}

const load = (): ActionBindings => {
  const stored = readJson<ActionBindings | null>(STORAGE_KEYS.inputBindings, null);
  return stored && Array.isArray(stored.keyboard) && stored.gamepad ? stored : DEFAULT_BINDINGS;
};

/** The player's own action map (keyboard per player slot + gamepad), kept in localStorage. */
export const InputBindingsStore = signalStore(
  { providedIn: 'root' },
  withState<InputBindingsState>({ bindings: load() }),
  withComputed((s) => ({
    isDefault: computed(() => JSON.stringify(s.bindings()) === JSON.stringify(DEFAULT_BINDINGS)),
  })),
  withMethods((store) => {
    const save = (bindings: ActionBindings): void => {
      patchState(store, { bindings });
      writeJson(STORAGE_KEYS.inputBindings, bindings);
    };
    return {
      setKeys(player: number, action: Action, keys: string[]): void {
        const keyboard = store
          .bindings()
          .keyboard.map((p, i) => (i === player ? { ...p, [action]: keys } : p));
        save({ ...store.bindings(), keyboard });
      },
      /** Gamepad bindings are shared by every slot: a pad is assigned to a player, not rebound. */
      setGamepad(action: Action, refs: GamepadButtonRef[]): void {
        save({ ...store.bindings(), gamepad: { ...store.bindings().gamepad, [action]: refs } });
      },
      reset(): void {
        save(DEFAULT_BINDINGS);
      },
    };
  }),
);
