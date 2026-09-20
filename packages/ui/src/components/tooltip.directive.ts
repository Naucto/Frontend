import { Overlay, OverlayModule, type OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

/** A run of a paragraph: prose, or an identifier the reader may have to type. */
export interface TooltipRun {
  readonly code: boolean;
  readonly text: string;
}

/**
 * The shape a tooltip's text is read in: paragraphs split on a blank line, and anything between
 * backticks set as code.
 *
 * Kept this small on purpose. The help texts are written in a locale file, where a blank line and
 * a backtick are things a translator can see and keep; a markup language would be a second thing
 * to learn and a second thing to break. A text with neither renders as the one line it always was.
 */
export const tooltipParagraphs = (text: string): readonly (readonly TooltipRun[])[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) =>
      p
        .split('`')
        .map((text, i) => ({ code: i % 2 === 1, text }))
        .filter((run) => run.text.length > 0),
    );

/** The same text with the backticks taken out, for a place that shows text and not runs. */
export const tooltipPlainText = (text: string): string => text.replaceAll('`', '');

@Component({
  selector: 'nc-tooltip-panel',
  template: `
    @if (title(); as heading) {
      <div class="label border-b border-line px-1.5 py-0.75">{{ heading }}</div>
    }
    <div [class]="title() ? 'px-1.5 py-1' : 'px-1 py-0.5'">
      @for (p of paragraphs(); track $index) {
        <p [class.mt-1]="$index > 0">
          @for (run of p; track $index) {
            @if (run.code) {
              <code class="rounded-xs bg-inset px-0.5 font-mono text-[0.95em] text-ink">
                {{ run.text }}
              </code>
            } @else {
              {{ run.text }}
            }
          }
        </p>
      }
    </div>
  `,
  host: {
    role: 'tooltip',
    class:
      'block overflow-hidden rounded-sm border border-line-strong bg-raised font-ui shadow-[0_2px_0_var(--nc-inset)]',
    '[class]': 'shape()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TooltipPanelComponent {
  readonly text = signal('');
  readonly title = signal<string | undefined>(undefined);
  protected readonly paragraphs = computed(() => tooltipParagraphs(this.text()));
  /**
   * A titled tooltip is a help text — read, not glanced at — so it gets the body size and more
   * room to wrap. The untitled one is a label for a control and stays small.
   */
  protected readonly shape = computed(() =>
    this.title()
      ? 'max-w-[44ch] text-body leading-[1.6] text-ink-body'
      : 'max-w-[32ch] text-meta text-ink',
  );
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
  /** Set on a help text; leaves a control's label alone. */
  readonly tooltipTitle = input<string>();
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
    // A pointer that lands on the host fires mouseenter and then focus, so two of the listeners
    // above open the same tooltip on one gesture. Without the timer in the guard the second call
    // overwrites the handle of the first, which nothing can then clear — not hide(), not the
    // teardown below — and it attaches an overlay no one holds a reference to.
    if (this.ref || this.timer || !this.ncTooltip()) return;
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
      this.ref = this.overlay.create({
        positionStrategy: position,
        panelClass: 'nc-overlay',
        scrollStrategy: this.overlay.scrollStrategies.reposition(),
      });
      const panel = this.ref.attach(new ComponentPortal(TooltipPanelComponent));
      panel.instance.text.set(this.ncTooltip());
      panel.instance.title.set(this.tooltipTitle());
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
