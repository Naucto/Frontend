import { Overlay, type OverlayRef } from '@angular/cdk/overlay';
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
 * to learn and a second thing to break. A text with neither renders as one line.
 */
export const tooltipParagraphs = (text: string): readonly (readonly TooltipRun[])[] =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) =>
      paragraph
        .split('`')
        .map((text, i) => ({ code: i % 2 === 1, text }))
        .filter((run) => run.text.length > 0),
    );

/** The same text with the backticks taken out, for a place that shows text and not runs. */
export const tooltipPlainText = (text: string): string => text.replaceAll('`', '');

/**
 * The motion is the host's and the frame is its child's: a bevel sets its own `translate` and
 * `transition`, which are the two things the arrival is made of.
 */
@Component({
  selector: 'nc-tooltip-panel',
  templateUrl: './tooltip-panel.component.html',
  host: {
    role: 'tooltip',
    class:
      'block font-ui [clip-path:inset(0_0_0_0)] transition-[opacity,translate,clip-path] duration-[180ms] ease-out ' +
      'starting:-translate-y-[8px] starting:opacity-0 starting:[clip-path:inset(0_0_100%_0)]',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TooltipPanelComponent {
  readonly text = signal('');
  readonly title = signal<string | undefined>(undefined);
  readonly meta = signal<readonly string[]>([]);
  protected readonly paragraphs = computed(() => tooltipParagraphs(this.text()));
  /**
   * A titled tooltip is a help text — read, not glanced at — so it gets a heading and room to
   * wrap. The untitled one is a label for a control: one line, in caps.
   */
  protected readonly shape = computed(() =>
    this.title()
      ? 'grid w-[260px] gap-1 px-[14px] py-1.5 text-meta leading-[1.45] text-ink'
      : 'max-w-[32ch] px-[10px] py-[6px] text-label leading-[1.4] tracking-tag text-ink uppercase',
  );
}

/** Hover/focus tooltip. Usage: <button ncTooltip="Kick this player">. */
@Directive({
  selector: '[ncTooltip]',
  host: {
    '(mouseenter)': 'show()',
    '(mouseleave)': 'leave()',
    '(focus)': 'show()',
    '(blur)': 'leave()',
    '(keydown.escape)': 'hide()',
    '(pointerdown)': 'press()',
  },
})
export class TooltipDirective {
  readonly ncTooltip = input.required<string>();
  /** Set on a help text; leaves a control's label alone. */
  readonly tooltipTitle = input<string>();
  /** Facts set under a help text, one per line: what a setting is at, when a build was made. */
  readonly tooltipMeta = input<readonly string[]>([]);
  readonly tooltipDelay = input(750);

  private readonly overlay = inject(Overlay);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private ref: OverlayRef | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** A press answers the label: it goes, and stays away until the pointer has left and come back. */
  private pressed = false;

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
    if (this.ref || this.timer || this.pressed || !this.ncTooltip()) {
      return;
    }
    this.timer = setTimeout(() => {
      const position = this.overlay
        .position()
        .flexibleConnectedTo(this.host)
        .withPositions([
          { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 10 },
          { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -10 },
          { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 10 },
          { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -10 },
        ]);
      this.ref = this.overlay.create({
        positionStrategy: position,
        scrollStrategy: this.overlay.scrollStrategies.reposition(),
      });
      const panel = this.ref.attach(new ComponentPortal(TooltipPanelComponent));
      panel.instance.text.set(this.ncTooltip());
      panel.instance.title.set(this.tooltipTitle());
      panel.instance.meta.set(this.tooltipMeta());
    }, this.tooltipDelay());
  }

  protected hide(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = null;
    this.ref?.dispose();
    this.ref = null;
  }

  protected press(): void {
    this.pressed = true;
    this.hide();
  }

  protected leave(): void {
    this.pressed = false;
    this.hide();
  }
}
