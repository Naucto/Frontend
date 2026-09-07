import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The controller the artboard draws on the CONTROLS tab, where a 48px icon used to stand in for it.
 * Traced from the design at its own 96x56 grid; every fill is a token, so it follows the theme
 * rather than staying dark on a light page.
 *
 * It is one shape in sixteen pieces, which is the whole reason it is a file of its own: inlined, it
 * would bury the rest of the card it sits in. Hidden from assistive tech: the card around it
 * already announces the status, the slot, the pad's name and the prompt.
 */
@Component({
  selector: 'nc-gamepad-art',
  template: `
    <svg viewBox="0 0 96 56" width="236" height="138" class="max-w-full" aria-hidden="true">
      <!-- Body, then the inset face it carries. -->
      <path
        d="M22 10h52v4h6v4h4v6h4v18h-4v6h-4v4h-8v-4h-6v-4H30v4h-6v4h-8v-4h-4v-6H8V24h4v-6h4v-4h6z"
        fill="var(--nc-raised)"
      />
      <path
        d="M22 12h52v2h6v4h4v6h4v16h-4v6h-4v2h-6v-2h-6v-4H28v4h-6v2h-6v-2h-4v-6H10V24h4v-6h4v-4h4z"
        fill="var(--nc-line)"
      />

      <!-- D-pad: the well it sits in, then the cross. -->
      <path d="M26 24h6v-6h6v6h6v6h-6v6h-6v-6h-6z" fill="var(--nc-sunken)" />
      <path d="M27 25h5v-6h4v6h5v4h-5v6h-4v-6h-5z" fill="var(--nc-ink-3)" />

      <!-- Face buttons, in the four accents the palette reserves for them. -->
      <circle cx="70" cy="18" r="4" fill="var(--nc-gold)" />
      <circle cx="62" cy="26" r="4" fill="var(--nc-sky)" />
      <circle cx="78" cy="26" r="4" fill="var(--nc-jade)" />
      <circle cx="70" cy="34" r="4" fill="var(--nc-hot)" />

      <!-- Sticks, each a well with a cap. -->
      <circle cx="38" cy="40" r="7" fill="var(--nc-sunken)" />
      <circle cx="38" cy="40" r="5" fill="var(--nc-line-strong)" />
      <circle cx="58" cy="40" r="7" fill="var(--nc-sunken)" />
      <circle cx="58" cy="40" r="5" fill="var(--nc-line-strong)" />

      <!-- Select and start, then the two shoulders behind the body. -->
      <rect x="42" y="16" width="5" height="4" fill="var(--nc-sunken)" />
      <rect x="49" y="16" width="5" height="4" fill="var(--nc-sunken)" />
      <rect x="20" y="6" width="12" height="4" fill="var(--nc-line-strong)" />
      <rect x="64" y="6" width="12" height="4" fill="var(--nc-line-strong)" />
    </svg>
  `,
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamepadArtComponent {}
