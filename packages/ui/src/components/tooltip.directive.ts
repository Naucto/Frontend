import { Overlay, OverlayModule, type OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

@Component({
  selector: 'nc-tooltip-panel',
  template: '{{ text() }}',
  host: {
    role: 'tooltip',
    class:
      'block max-w-[32ch] rounded-sm border border-line-strong bg-raised px-1 py-0.5 font-ui text-meta text-ink shadow-[0_2px_0_var(--nc-inset)]',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TooltipPanelComponent {
  readonly text = signal('');
}

/** Hover/focus tooltip. Usage: <button ncTooltip="Kick this player">. */
@Directive({
  selector: '[ncTooltip]',
  host: {
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    '(focus)': 'show()',
    '(blur)': 'hide()',
    '(keydown.escape)': 'hide()',
  },
})
export class TooltipDirective {
  readonly ncTooltip = input.required<string>();
  readonly tooltipDelay = input(400);

  private readonly overlay = inject(Overlay);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private ref: OverlayRef | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.hide();
    });
  }

  protected show(): void {
    if (this.ref || !this.ncTooltip()) return;
    this.timer = setTimeout(() => {
      const position = this.overlay
        .position()
        .flexibleConnectedTo(this.host)
        .withPositions([
          { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 6 },
          {
            originX: 'center',
            originY: 'top',
            overlayX: 'center',
            overlayY: 'bottom',
            offsetY: -6,
          },
        ]);
      this.ref = this.overlay.create({ positionStrategy: position, panelClass: 'nc-overlay' });
      const panel = this.ref.attach(new ComponentPortal(TooltipPanelComponent));
      panel.instance.text.set(this.ncTooltip());
    }, this.tooltipDelay());
  }

  protected hide(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ref?.dispose();
    this.ref = null;
  }
}

export const TOOLTIP_IMPORTS = [OverlayModule, TooltipDirective] as const;
