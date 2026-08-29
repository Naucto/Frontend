import {
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
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

import { luaAutocomplete, luaLanguage } from './lua-language';
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
    const hex = { sky: '#68aed4', blush: '#ff80a4', jade: '#10d275' }[colour];
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
