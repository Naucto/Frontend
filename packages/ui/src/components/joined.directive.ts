import { Directive } from '@angular/core';

/**
 * Ghost buttons set side by side as one strip: the strip is framed by the line ghost buttons
 * light up in, a line runs between its cells, and nothing fills it until a cell is pointed at.
 * The cells draw all of it themselves (`ButtonDirective` knows it stands in a strip), so the strip
 * only lays them out.
 */
@Directive({
  selector: '[ncJoined]',
  host: { class: 'inline-flex items-start' },
})
export class JoinedDirective {}
