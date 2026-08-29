import { Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import type { TemplateRef } from '@angular/core';
import {
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  model,
  ViewContainerRef,
} from '@angular/core';

export type PopoverAlign = 'start' | 'center' | 'end';

/**
 * Anchored floating panel (versions, account, notifications, doc hover cards).
 * Usage: <button [ncPopover]="tpl" [(popoverOpen)]="open">…</button> <ng-template #tpl>…</ng-template>
 * Closes on backdrop click and Escape; restores focus to the trigger.
 */
@Directive({
  selector: '[ncPopover]',
  host: {
    '(click)': 'toggle()',
    '[attr.aria-expanded]': 'popoverOpen()',
    'aria-haspopup': 'dialog',
  },
})
export class PopoverDirective {
  readonly ncPopover = input.required<TemplateRef<unknown>>();
  readonly popoverAlign = input<PopoverAlign>('start');
  readonly popoverOpen = model(false);

  private readonly overlay = inject(Overlay);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly vcr = inject(ViewContainerRef);
  private ref: OverlayRef | null = null;

  constructor() {
    // `popoverOpen` is two-way, so a parent may write it — "the menu item was picked, put the panel
    // away". Without this the write only moved the signal: the OverlayRef stayed attached, and its
    // full-viewport backdrop went on swallowing every click on the page underneath, so the route
    // the item had just navigated to sat there unreachable behind an invisible sheet.
    effect(() => {
      const wanted = this.popoverOpen();
      // Also the guard against re-entry: open()/close() write the model themselves.
      if (wanted === (this.ref !== null)) return;
      if (wanted) this.open();
      else this.close();
    });

    inject(DestroyRef).onDestroy(() => {
      this.close();
    });
  }

  toggle(): void {
    if (this.ref) this.close();
    else this.open();
  }

  open(): void {
    if (this.ref) return;
    const x = this.popoverAlign();
    const position = this.overlay
      .position()
      .flexibleConnectedTo(this.host)
      .withPositions([
        { originX: x, originY: 'bottom', overlayX: x, overlayY: 'top', offsetY: 4 },
        { originX: x, originY: 'top', overlayX: x, overlayY: 'bottom', offsetY: -4 },
      ]);
    this.ref = this.overlay.create({
      positionStrategy: position,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      panelClass: 'nc-overlay',
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
    });
    this.ref.backdropClick().subscribe(() => {
      this.close();
    });
    this.ref.keydownEvents().subscribe((e) => {
      if (e.key === 'Escape') this.close();
    });
    this.ref.attach(new TemplatePortal(this.ncPopover(), this.vcr));
    this.popoverOpen.set(true);
  }

  close(): void {
    if (!this.ref) return;
    this.ref.dispose();
    this.ref = null;
    this.popoverOpen.set(false);
    this.host.nativeElement.focus({ preventScroll: true });
  }
}
