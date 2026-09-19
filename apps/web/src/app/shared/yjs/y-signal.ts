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

/** Two-way binding to a Y.Text used as a plain string field (name, description…). */
export function yTextField(text: Y.Text): WritableSignal<string> {
  const s = signal(text.toString());
  const handler = (): void => {
    s.set(text.toString());
  };
  text.observe(handler);
  inject(DestroyRef).onDestroy(() => {
    text.unobserve(handler);
  });
  const original = s.set.bind(s);
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

/** Signal over a Y.Map key. */
export function yMapField<T>(map: Y.Map<unknown>, key: string, fallback: T): WritableSignal<T> {
  const read = (): T => (map.has(key) ? (map.get(key) as T) : fallback);
  const s = signal<T>(read());
  const handler = (e: Y.YMapEvent<unknown>): void => {
    if (e.keysChanged.has(key)) s.set(read());
  };
  map.observe(handler);
  inject(DestroyRef).onDestroy(() => {
    map.unobserve(handler);
  });
  const original = s.set.bind(s);
  s.set = (value: T): void => {
    map.doc?.transact(() => {
      map.set(key, value);
    }, LOCAL_ORIGIN);
    original(value);
  };
  s.update = (fn: (v: T) => T): void => {
    s.set(fn(s()));
  };
  return s;
}

/** Bumps a counter on every deep change — for canvases that redraw from typed arrays. */
export function yVersion(type: Y.AbstractType<unknown>): Signal<number> {
  const s = signal(0);
  const handler = (): void => {
    s.update((v) => v + 1);
  };
  type.observeDeep(handler);
  inject(DestroyRef).onDestroy(() => {
    type.unobserveDeep(handler);
  });
  return s.asReadonly();
}
