import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { GAMEPAD_DEADZONE, MAX_PLAYERS } from '@naucto/engine';
import {
  ButtonDirective,
  type ButtonVariant,
  ChipComponent,
  EmptyStateComponent,
  LabelComponent,
  MarkComponent,
  OptionDirective,
  PopoverDirective,
  PopoverPanelComponent,
  SliderComponent,
} from '@naucto/ui';

import { PadSettingsStore } from '../game-screen/pad-settings.store';
import { PLAYER_TONES, type PlayerTone } from '../input/player-tone';
import { GamepadSeatsStore } from './gamepad-seats.store';
import { PAD_BUTTONS, PadArtComponent, type PadButton, type StickLean } from './pad-art.component';
import { PadPreviewComponent } from './pad-preview.component';

/** A connected gamepad and what a hand is doing on it. */
interface ConnectedPad {
  index: number;
  name: string;
  held: PadButton[];
  left: StickLean;
  right: StickLean;
}

/** The name a browser gives a gamepad, without the vendor and product numbers it wraps it in. */
export function padName(id: string): string {
  return (
    id
      .replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .trim() || id
  );
}

const lean = (axis = 0): number => (Math.abs(axis) > GAMEPAD_DEADZONE ? Math.sign(axis) : 0);

/** The button that names a player, in that player's colour whatever the theme. */
const BADGES: Record<PlayerTone, ButtonVariant> = {
  gold: 'gold',
  sky: 'sky',
  jade: 'jade',
  hot: 'run',
};

/**
 * What belongs to this device rather than to a game: which player each gamepad drives, and the
 * size and opacity of the on-screen pad. A gamepad is a card, its drawing lit by what is held on
 * it, and the badge that names its player opens the four seats.
 */
@Component({
  selector: 'nc-controls',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    ChipComponent,
    EmptyStateComponent,
    LabelComponent,
    MarkComponent,
    OptionDirective,
    PadArtComponent,
    PadPreviewComponent,
    PopoverDirective,
    PopoverPanelComponent,
    SliderComponent,
  ],
  templateUrl: './controls.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlsComponent {
  protected readonly padSettings = inject(PadSettingsStore);
  private readonly seats = inject(GamepadSeatsStore);
  protected readonly badges = BADGES;
  /** The gamepad whose seats are open. */
  protected readonly choosing = signal<number | null>(null);
  protected readonly pads = signal<readonly ConnectedPad[]>([], {
    equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });

  /** The four players, each with the gamepad that drives it, if one is connected. */
  protected readonly players = computed(() =>
    PLAYER_TONES.map((tone, player) => ({
      player,
      tone,
      pad: this.pads().find((pad) => this.seats.seats()[pad.index] === player),
    })),
  );
  /** The seat the next gamepad takes: the browser gives it the first index nobody holds. */
  private readonly nextSeat = computed(() =>
    this.seats.seats().find((_, index) => !this.pads().some((pad) => pad.index === index)),
  );
  /** A card per connected gamepad and one for the seat the next takes, in the players' order. */
  protected readonly cards = computed(() =>
    this.players().filter((seat) => seat.pad !== undefined || seat.player === this.nextSeat()),
  );

  constructor() {
    // Read every frame: the Gamepad API has no event for a button or a stick.
    let frame = 0;
    const read = (): void => {
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      this.pads.set(
        pads.slice(0, MAX_PLAYERS).flatMap((pad, index) =>
          pad
            ? [
                {
                  index,
                  name: padName(pad.id),
                  held: PAD_BUTTONS.filter((_, button) => pad.buttons[button]?.pressed),
                  left: [lean(pad.axes[0]), lean(pad.axes[1])] as const,
                  right: [lean(pad.axes[2]), lean(pad.axes[3])] as const,
                },
              ]
            : [],
        ),
      );
      frame = requestAnimationFrame(read);
    };
    read();
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(frame);
    });
  }

  protected assign(pad: number, player: number): void {
    this.seats.assign(pad, player);
    this.choosing.set(null);
  }
}
