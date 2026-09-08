import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The controller drawn on the CONTROLS tab, beside the slot and the prompt to press a button.
 *
 * A line, not a picture. It stands for "a gamepad" next to a table of bindings, and a shaded
 * object with coloured buttons competed with the four real ones in the table for the same glance —
 * it also had to state which face was which colour, a claim no two controllers agree on. One
 * stroke in the current ink says the same thing and says nothing more.
 *
 * Hidden from assistive tech: the card around it already announces the status, the slot, the pad's
 * name and the prompt.
 */
@Component({
  selector: 'nc-gamepad-art',
  template: `
    <svg
      viewBox="0 0 96 56"
      width="236"
      height="138"
      class="max-w-full text-ink-4"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path
        d="M34 13h28c12 0 20 5 23 15l5 16c2 7-3 11-9 9-6-2-10-7-14-12H29c-4 5-8 10-14 12-6 2-11-2-9-9l5-16c3-10 11-15 23-15z"
      />
      <path d="M26 21h8v6h6v6h-6v6h-8v-6h-6v-6h6z" />
      <circle cx="68" cy="22" r="3" />
      <circle cx="60" cy="30" r="3" />
      <circle cx="76" cy="30" r="3" />
      <circle cx="68" cy="38" r="3" />
      <path d="M43 25h4M53 25h4" />
    </svg>
  `,
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamepadArtComponent {}
