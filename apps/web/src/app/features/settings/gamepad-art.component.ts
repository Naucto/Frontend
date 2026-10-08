import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The controller drawn on the CONTROLS tab, as outlines only so the card's colour shows through.
 * Hidden from assistive tech: the card around it carries the words.
 */
@Component({
  selector: 'nc-gamepad-art',
  templateUrl: './gamepad-art.component.html',
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamepadArtComponent {}
