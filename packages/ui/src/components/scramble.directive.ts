import { Directive, effect, ElementRef, inject, input } from '@angular/core';

import { prefersStill } from '../motion';

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*+=<>?';
/** What is never garbled: the shape of the line stays readable through the change. */
const KEPT = new Set([' ', ',', '.']);
const LEAVING = 200;
const ARRIVING = 300;
/** A frame is held this long, so the glyphs flicker rather than blur. */
const HELD = 45;

/**
 * One frame of a text on its way out or in. Each character turns at its own moment, earlier
 * toward the start of the line and shifted by its seed; `progress` runs from 0 to 1.
 */
export function scrambled(
  text: string,
  progress: number,
  arriving: boolean,
  seeds: readonly number[],
  glyph: () => string,
): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    const seed = seeds[(i + (arriving ? 37 : 0)) % seeds.length] ?? 0;
    const turned = progress >= (i / text.length) * 0.7 + seed * 0.3;
    out += KEPT.has(char) || turned === arriving ? char : glyph();
  }
  return out;
}

/**
 * Prints a text and, when it changes, garbles the old one away and the new one in. The element's
 * text is this directive's alone. A screen reader would read every frame: use it on text that is
 * said elsewhere and hidden from it here.
 */
@Directive({ selector: '[ncScramble]' })
export class ScrambleDirective {
  readonly text = input.required<string>({ alias: 'ncScramble' });

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let shown: string | null = null;
    effect((onCleanup) => {
      const to = this.text();
      const from = shown;
      shown = to;
      if (from === null || from === to || prefersStill(element)) {
        element.textContent = to;
        return;
      }
      const seeds = Array.from({ length: 128 }, Math.random);
      const glyph = (): string => GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
      let started = 0;
      let drawn = 0;
      let frame = 0;
      const step = (now: number): void => {
        started ||= now;
        const elapsed = now - started;
        const done = elapsed >= LEAVING + ARRIVING;
        if (done) {
          element.textContent = to;
          return;
        }
        if (now - drawn > HELD) {
          drawn = now;
          element.textContent =
            elapsed < LEAVING
              ? scrambled(from, elapsed / LEAVING, false, seeds, glyph)
              : scrambled(to, (elapsed - LEAVING) / ARRIVING, true, seeds, glyph);
        }
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
      onCleanup(() => {
        cancelAnimationFrame(frame);
      });
    });
  }
}
