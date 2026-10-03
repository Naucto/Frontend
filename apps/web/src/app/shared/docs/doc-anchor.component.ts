import {
  afterRenderEffect,
  booleanAttribute,
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
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, IconComponent } from '@naucto/ui';

import { type DocPage } from './docs.service';

interface Target {
  kind: 'heading' | 'api';
  id: string;
  title: string;
  /** The tutorial step the target is in, or 0: a subsection keeps its step's count and buttons. */
  step: number;
  steps: number;
}

const TARGETS = 'h1[id], h2[id], h3[id], article.api-card[id]';

/**
 * The reading position: the page title, then the heading or function card the reader is in, kept
 * at the top of the article while its own heading has scrolled away. On a tutorial it counts the
 * step and steps to the next or previous one.
 */
@Component({
  selector: 'nc-doc-anchor',
  imports: [TranslocoDirective, ButtonDirective, IconComponent],
  templateUrl: './doc-anchor.component.html',
  host: {
    'data-testid': 'doc-anchor',
    '[class]': 'hostClass()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocAnchorComponent {
  readonly page = input.required<DocPage>();
  /** The rendered article's root, where the headings and cards are looked for. */
  readonly article = input<HTMLElement | null>(null);
  /** The element that scrolls the article; null when the window does. */
  readonly container = input<HTMLElement | null>(null);
  /** Only the row's content: the host draws its own bar around it. */
  readonly bare = input(false, { transform: booleanAttribute });
  /** The anchor a step button landed on, for the host to put in its URL or its tree. */
  readonly jump = output<string>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly current = signal<Target | null>(null);
  protected readonly hostClass = computed(() => {
    const row = 'relative flex min-w-0 flex-1 items-center gap-1';
    if (this.bare()) {
      return row;
    }
    // No flow height of its own: the document would grow by a bar each time it shows, and scroll
    // anchoring would answer with a scroll event that hides it again.
    const bar = `sticky top-0 z-10 -mb-(--nc-bar-h) h-(--nc-bar-h) border-b border-line bg-panel px-2 ${row}`;
    return this.current() ? bar : `${bar} invisible`;
  });

  constructor() {
    let listening: HTMLElement | Window | null = null;
    let frame = 0;
    const onScroll = (): void => {
      if (frame) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        this.recompute();
      });
    };
    afterRenderEffect(() => {
      const scroller: HTMLElement | Window = this.container() ?? window;
      this.page();
      this.article();
      if (scroller !== listening) {
        listening?.removeEventListener('scroll', onScroll);
        scroller.addEventListener('scroll', onScroll, { passive: true });
        listening = scroller;
      }
      this.recompute();
    });
    inject(DestroyRef).onDestroy(() => {
      listening?.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    });
  }

  /**
   * Where the article goes out of sight: the scroller's top edge, or the bar's bottom where the
   * bar stands over the scroller. Out of view the bar is invisible, not display-none, so this
   * edge measures the same whether or not it shows.
   */
  private line(): number {
    const bar = this.host.nativeElement.getBoundingClientRect().bottom;
    return Math.max(bar, this.container()?.getBoundingClientRect().top ?? 0);
  }

  /** The last target whose top has passed the line, or nothing while the title is in view. */
  private recompute(): void {
    const root = this.article();
    if (!root) {
      this.current.set(null);
      return;
    }
    const line = this.line();
    let found: HTMLElement | null = null;
    let within: HTMLElement | null = null;
    for (const el of root.querySelectorAll<HTMLElement>(TARGETS)) {
      if (el.getBoundingClientRect().top > line + 1) {
        break;
      }
      found = el;
      if (el.dataset.step) {
        within = el;
      }
    }
    this.current.set(found && found.tagName !== 'H1' ? this.describe(found, within) : null);
  }

  private describe(el: HTMLElement, within: HTMLElement | null): Target {
    const id = el.id;
    if (el.classList.contains('api-card')) {
      return { kind: 'api', id, title: id, step: 0, steps: 0 };
    }
    const title = (el.textContent?.trim() ?? '').replace(/^Step \d+:\s*/, '');
    return {
      kind: 'heading',
      id,
      title,
      step: Number(within?.dataset.step ?? 0),
      steps: Number(within?.dataset.steps ?? 0),
    };
  }

  /** Scrolls the anchor to the top of the article, just under the bar rather than beneath it. */
  reveal(id: string): void {
    const target = this.article()?.querySelector<HTMLElement>(`[id="${id}"]`);
    if (!target) {
      return;
    }
    target.scrollIntoView({ block: 'start' });
    const under = target.getBoundingClientRect().top - this.line();
    if (under < 0) {
      (this.container() ?? window).scrollBy(0, under);
    }
  }

  protected stepTo(step: number): void {
    const id = this.article()?.querySelector(`h2[data-step="${String(step)}"]`)?.id;
    if (!id) {
      return;
    }
    this.reveal(id);
    this.jump.emit(id);
  }
}
