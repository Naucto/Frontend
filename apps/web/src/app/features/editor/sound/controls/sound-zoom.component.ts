import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, IconComponent, SliderComponent } from '@naucto/ui';

import { logZoomScale } from '../../log-zoom-scale';

@Component({
  selector: 'nc-sound-zoom',
  imports: [TranslocoDirective, ButtonDirective, IconComponent, SliderComponent],
  templateUrl: './sound-zoom.component.html',
  host: { class: 'flex shrink-0 items-center gap-0.5' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundZoomComponent {
  readonly value = input.required<number>();
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  readonly changed = output<number>();

  private readonly scale = computed(() => logZoomScale(this.min(), this.max()));
  protected readonly position = computed(() => this.scale().positionOf(this.value()));
  protected readonly percent = computed(() => `${String(Math.round(this.value() * 100))} %`);

  protected step(delta: number): void {
    this.set(this.value() * Math.pow(2, delta));
  }

  protected slide(position: number): void {
    this.set(this.scale().zoomAt(position));
  }

  protected set(zoom: number): void {
    this.changed.emit(Math.max(this.min(), Math.min(this.max(), zoom)));
  }
}
