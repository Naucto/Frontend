import { DestroyRef, inject, type Signal, signal, type WritableSignal } from '@angular/core';
import { LOCAL_ORIGIN } from '@naucto/engine';
import type * as Y from 'yjs';

/** A read-only signal kept in sync from a Yjs observer; unsubscribes with the injector. */
export function ySignal<T>(
  read: () => T,
  observe: (cb: () => void) => () => void,
  equal?: (a: T, b: T) => boolean,
): Signal<T> {
  const s = signal<T>(read(), equal ? { equal } : undefined);
  const off = observe(() => {
    s.set(read());
  });
  inject(DestroyRef).onDestroy(off);
  return s.asReadonly();
}

/** Bumped on every change to `type`, for a computed that reads Yjs state directly; unobserves with the injector. */
export function yVersion(type: {
  observe(f: () => void): void;
  unobserve(f: () => void): void;
}): Signal<number> {
  const version = signal(0);
  const bump = (): void => {
    version.update((v) => v + 1);
  };
  type.observe(bump);
  inject(DestroyRef).onDestroy(() => {
    type.unobserve(bump);
  });
  return version.asReadonly();
}

/** Two-way binding to a Y.Text used as a plain string field (name, description…). */
export function yTextField(text: Y.Text): WritableSignal<string> {
  const s = signal(text.toString());
  // The observer and the public setter both write here, and the setter below is installed after
  // the observer is registered: a remote edit must not be judged by the setter's guard, which
  // reads the very value the observer is delivering and would answer "nothing changed".
  const original = s.set.bind(s);
  const handler = (): void => {
    original(text.toString());
  };
  text.observe(handler);
  inject(DestroyRef).onDestroy(() => {
    text.unobserve(handler);
  });
  s.set = (value: string): void => {
    if (value === text.toString()) return;
    text.doc?.transact(() => {
      text.delete(0, text.length);
      if (value) text.insert(0, value);
    }, LOCAL_ORIGIN);
    original(value);
  };
  s.update = (fn: (v: string) => string): void => {
    s.set(fn(s()));
  };
  return s;
}
