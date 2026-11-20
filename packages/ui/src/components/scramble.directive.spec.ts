import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { scrambled, ScrambleDirective } from './scramble.directive';

describe('scrambled', () => {
  const seeds = Array.from({ length: 128 }, (_, i) => (i % 10) / 10);
  const glyph = (): string => '#';

  it('leaves the text whole before it starts to go, and garbles it all by the end', () => {
    expect(scrambled('Night Survivors', -0.01, false, seeds, glyph)).toBe('Night Survivors');
    expect(scrambled('Night Survivors', 1, false, seeds, glyph)).toBe('##### #########');
  });

  it('brings the new text in from garble, whole by the end', () => {
    expect(scrambled('Puyo Tsu', -0.01, true, seeds, glyph)).toBe('#### ###');
    expect(scrambled('Puyo Tsu', 1, true, seeds, glyph)).toBe('Puyo Tsu');
  });

  it('turns the start of the line before its end, and never the spaces or the punctuation', () => {
    const flat = Array<number>(128).fill(0);
    expect(scrambled('ab, cd. ef, gh', 0.4, false, flat, glyph)).toBe('##, ##. #f, gh');
  });
});

@Component({
  imports: [ScrambleDirective],
  template: '<span [ncScramble]="text()"></span>',
})
class HostComponent {
  readonly text = signal('Hightide');
}

describe('ScrambleDirective', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the first text as it is', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toBe('Hightide');
  });

  it('changes at once where motion is reduced', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    fixture.componentInstance.text.set('Moss Garden');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toBe('Moss Garden');
  });

  it('passes through garble on its way to the new text', () => {
    let frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => frames.push(frame));
    /** Runs what is waiting for a frame: the directive's step, among whatever else asked for one. */
    const frame = (now: number): void => {
      const due = frames;
      frames = [];
      for (const callback of due) {
        callback(now);
      }
    };
    const fixture = TestBed.createComponent(HostComponent);
    const host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    fixture.componentInstance.text.set('Moss Garden');
    fixture.detectChanges();

    frame(1000);
    frame(1190);
    expect(host.textContent).toHaveLength('Hightide'.length);
    expect(host.textContent).not.toBe('Hightide');

    frame(1600);
    expect(host.textContent).toBe('Moss Garden');
  });
});
