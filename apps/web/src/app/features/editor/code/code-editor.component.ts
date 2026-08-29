import {
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { DocsService } from '@app/shared/docs/docs.service';
import { closeBrackets } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { type Diagnostic, linter, lintGutter } from '@codemirror/lint';
import { highlightSelectionMatches, openSearchPanel, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension, RangeSet } from '@codemirror/state';
import {
  Decoration,
  drawSelection,
  EditorView,
  gutterLineClass,
  GutterMarker,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import type { EngineError } from '@naucto/engine';
import type { PresenceColour } from '@naucto/ui';
import { yCollab } from 'y-codemirror.next';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import { luaHover } from './lua-docs';
import { luaAutocomplete, luaLanguage, setDocsLookup } from './lua-language';
import { naucto_highlight, nauctoTheme } from './theme';

export interface CursorInfo {
  line: number;
  col: number;
}

/** CodeMirror 6 bound to a Y.Text through y-codemirror.next (collaborator carets included). */
@Component({
  selector: 'nc-code-editor',
  template: '<div #host class="h-full"></div>',
  host: { class: 'block h-full min-h-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeEditorComponent {
  private readonly docs = inject(DocsService);

  /** Insert text at the caret (DOC pane → "insert at cursor"). */
  insert(text: string): boolean {
    const view = this.view;
    if (!view) return false;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    });
    view.focus();
    return true;
  }
  readonly text = input.required<Y.Text>();
  readonly awareness = input<Awareness | null>(null);
  readonly colour = input<PresenceColour>('sky');
  readonly userName = input('you');
  readonly error = input<EngineError | null>(null);
  readonly cursor = output<CursorInfo>();
  readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');

  private view: EditorView | null = null;

  /**
   * Open CodeMirror's find panel. The keymap lives on the editor's own content element, so a
   * synthetic keydown dispatched at the document never reaches it — call the command directly.
   */
  openSearch(): void {
    const view = this.view;
    if (!view) return;
    view.focus();
    openSearchPanel(view);
  }

  /**
   * The dotted name under the cursor, for F1. Walks outward over identifier characters and dots,
   * so the caret anywhere in `gfx.spr` yields the whole call rather than half of it.
   */
  symbolAtCursor(): string | null {
    const view = this.view;
    if (!view) return null;
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const text = line.text;
    const isWord = (c: string): boolean => /[A-Za-z0-9_.]/.test(c);
    let start = pos - line.from;
    let end = start;
    while (start > 0 && isWord(text[start - 1] ?? '')) start--;
    while (end < text.length && isWord(text[end] ?? '')) end++;
    const word = text.slice(start, end).replace(/^\.+|\.+$/g, '');
    return word || null;
  }
  private readonly lintCompartment = new Compartment();

  constructor() {
    effect((cleanup) => {
      const text = this.text();
      const awareness = this.awareness();
      const colour = this.colour();
      const name = this.userName();
      untracked(() => {
        this.mount(text, awareness, colour, name);
      });
      cleanup(() => {
        this.view?.destroy();
        this.view = null;
      });
    });
    effect(() => {
      const err = this.error();
      const view = this.view;
      if (!view) return;
      view.dispatch({
        effects: [
          this.lintCompartment.reconfigure(this.lintSource(err)),
          this.errorLineCompartment.reconfigure(errorLineHighlight(err?.line ?? null)),
        ],
      });
    });
  }

  focus(): void {
    this.view?.focus();
  }

  private readonly errorLineCompartment = new Compartment();

  private lintSource(err: EngineError | null): ReturnType<typeof linter> {
    return linter(
      (view): Diagnostic[] => {
        if (!err?.line) return [];
        const doc = view.state.doc;
        const ln = Math.min(Math.max(1, err.line), doc.lines);
        const line = doc.line(ln);
        return [
          {
            from: line.from,
            to: line.to,
            severity: 'error',
            message: err.message.replace(/^Runtime error: /, ''),
          },
        ];
      },
      { delay: 0 },
    );
  }

  private mount(
    text: Y.Text,
    awareness: Awareness | null,
    colour: PresenceColour,
    name: string,
  ): void {
    this.view?.destroy();
    // y-codemirror.next writes the caret colour into an inline style, so it needs a literal —
    // but the literal comes from the token, not from a copy of it kept here. Three raw hexes in a
    // component were a second source of truth for --color-presence-*, and the kind that goes
    // stale silently.
    const hex = getComputedStyle(document.documentElement)
      .getPropertyValue(`--color-presence-${colour}`)
      .trim();
    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightSelectionMatches(),
      lintGutter(),
      this.lintCompartment.of(this.lintSource(this.error())),
      this.errorLineCompartment.of(errorLineHighlight(this.error()?.line ?? null)),
      luaLanguage,
      luaAutocomplete,
      luaHover(
        (name) => this.docs.lookup(name),
        (ns) => this.docs.peers(ns),
      ),
      syntaxHighlighting(naucto_highlight),
      nauctoTheme,
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      EditorState.tabSize.of(2),
      EditorView.updateListener.of((u) => {
        if (u.selectionSet || u.docChanged) {
          const pos = u.state.selection.main.head;
          const line = u.state.doc.lineAt(pos);
          this.cursor.emit({ line: line.number, col: pos - line.from + 1 });
        }
      }),
    ];
    if (awareness) {
      awareness.setLocalStateField('user', { name, color: hex, colorLight: `${hex}33` });
      extensions.push(yCollab(text, awareness));
    } else {
      extensions.push(yCollab(text, null));
    }
    setDocsLookup((name) => this.docs.lookup(name));
    void this.docs.load();
    this.view = new EditorView({
      state: EditorState.create({ doc: text.toString(), extensions }),
      parent: this.host().nativeElement,
    });
  }
}

/**
 * Tints the failing line and its gutter number, which is what makes an error legible at a glance;
 * the dotted underline alone is easy to miss.
 */
function errorLineHighlight(line: number | null): Extension {
  if (line === null) return [];
  const mark = Decoration.line({ class: 'cm-error-line' });
  return [
    EditorView.decorations.compute([], (state) => {
      if (line < 1 || line > state.doc.lines) return Decoration.none;
      return Decoration.set([mark.range(state.doc.line(line).from)]);
    }),
    gutterLineClass.compute([], (state) => {
      if (line < 1 || line > state.doc.lines) return RangeSet.empty as RangeSet<GutterMarker>;
      return RangeSet.of<GutterMarker>([errorGutterMarker.range(state.doc.line(line).from)]);
    }),
  ];
}

const errorGutterMarker = new (class extends GutterMarker {
  override elementClass = 'cm-error-line';
})();
