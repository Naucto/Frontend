import { Injectable, signal } from '@angular/core';
import { MAX_PLAYERS } from '@naucto/engine';

/**
 * Which player each gamepad drives, for every game of this tab. A pad starts on the player of its
 * own index, as the Gamepad API numbers it. The seats are always one pad per player: taking a seat
 * trades it with whichever index holds it, connected or not, so two pads never drive one player.
 *
 * Kept for the tab and no longer: a gamepad's index is the browser's for as long as the page
 * lives, and names nothing after a reload.
 */
@Injectable({ providedIn: 'root' })
export class GamepadSeatsStore {
  /** The player of each gamepad index. */
  readonly seats = signal<readonly number[]>(Array.from({ length: MAX_PLAYERS }, (_, i) => i));

  assign(pad: number, player: number): void {
    const seats = [...this.seats()];
    const left = seats[pad];
    const other = seats.indexOf(player);
    if (left === undefined || other < 0) {
      return;
    }
    seats[other] = left;
    seats[pad] = player;
    this.seats.set(seats);
  }
}
