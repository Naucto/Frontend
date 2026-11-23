import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { midiToNoteName } from '@naucto/engine';

import { PITCH_MAX, PITCH_MIN } from './piano-geometry';

const MIN_WHITE_W = 16;
const BLACK_SHARE = 0.62;
const BLACK = new Set([1, 3, 6, 8, 10]);

interface StripKey {
  pitch: number;
  name: string;
  black: boolean;
  left: number;
  octave: boolean;
}

@Component({
  selector: 'nc-key-strip',
  templateUrl: './key-strip.component.html',
  host: {
    class: 'block overflow-x-auto overflow-y-hidden touch-none select-none',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp()',
    '(pointercancel)': 'onUp()',
    '(lostpointercapture)': 'onUp()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyStripComponent {
  readonly from = input(PITCH_MIN);
  readonly to = input(PITCH_MAX);
  readonly label = input.required<string>();
  readonly pressed = output<number>();
  readonly released = output();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly held = signal<number | null>(null);
  private readonly boxWidth = signal(0);
  private readonly whiteCount = computed(() => {
    let count = 0;
    for (let pitch = this.from(); pitch <= this.to(); pitch++) {
      if (!BLACK.has(pitch % 12)) {
        count += 1;
      }
    }
    return count;
  });
  protected readonly whiteW = computed(() =>
    Math.max(MIN_WHITE_W, this.boxWidth() / Math.max(1, this.whiteCount())),
  );
  protected readonly blackW = computed(() => Math.round(this.whiteW() * BLACK_SHARE));

  constructor() {
    const observer = new ResizeObserver((entries) => {
      this.boxWidth.set(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(this.host.nativeElement);
    inject(DestroyRef).onDestroy(() => {
      observer.disconnect();
    });
  }

  protected readonly keys = computed<StripKey[]>(() => {
    const out: StripKey[] = [];
    const white = this.whiteW();
    const sharp = this.blackW();
    let whites = 0;
    for (let pitch = this.from(); pitch <= this.to(); pitch++) {
      const black = BLACK.has(pitch % 12);
      out.push({
        pitch,
        name: midiToNoteName(pitch),
        black,
        left: black ? whites * white - sharp / 2 : whites * white,
        octave: pitch % 12 === 0,
      });
      if (!black) {
        whites += 1;
      }
    }
    return out;
  });

  protected readonly width = computed(() => this.whiteCount() * this.whiteW());

  protected onDown(event: PointerEvent, pitch: number): void {
    if (event.button !== 0) {
      return;
    }
    this.host.nativeElement.setPointerCapture(event.pointerId);
    this.held.set(pitch);
    this.pressed.emit(pitch);
  }

  protected onMove(event: PointerEvent): void {
    if (this.held() === null) {
      return;
    }
    const under = document
      .elementsFromPoint(event.clientX, event.clientY)
      .find((element) => element instanceof HTMLElement && element.dataset.pitch !== undefined);
    const pitch = under instanceof HTMLElement ? Number(under.dataset.pitch) : null;
    if (pitch === null || pitch === this.held()) {
      return;
    }
    this.released.emit();
    this.held.set(pitch);
    this.pressed.emit(pitch);
  }

  protected onUp(): void {
    if (this.held() === null) {
      return;
    }
    this.held.set(null);
    this.released.emit();
  }
}
