import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { GamepadSeatsStore } from './gamepad-seats.store';

describe('GamepadSeatsStore', () => {
  it('seats each gamepad as the player of its own index', () => {
    expect(TestBed.inject(GamepadSeatsStore).seats()).toEqual([0, 1, 2, 3]);
  });

  it('trades seats, so a player is never driven by two gamepads', () => {
    const store = TestBed.inject(GamepadSeatsStore);

    store.assign(0, 2);
    expect(store.seats()).toEqual([2, 1, 0, 3]);

    store.assign(1, 2);
    expect(store.seats()).toEqual([1, 2, 0, 3]);
  });

  it('ignores a gamepad or a player past the four there are', () => {
    const store = TestBed.inject(GamepadSeatsStore);

    store.assign(4, 0);
    store.assign(0, 4);
    expect(store.seats()).toEqual([0, 1, 2, 3]);
  });
});
