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
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { type Diagnostic, linter, lintGutter } from '@codemirror/lint';
import {
  findNext,
  findPrevious,
  getSearchQuery,
  highlightSelectionMatches,
  replaceAll,
  replaceNext,
  search,
  SearchQuery,
  selectMatches,
  setSearchQuery,
} from '@codemirror/search';
import {
  Compartment,
  EditorState,
  type Extension,
  RangeSet,
  RangeSetBuilder,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  gutterLineClass,
  GutterMarker,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import type { EngineError } from '@naucto/engine';
import type { PresenceColour } from '@naucto/ui';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import { luaHover } from './lua-docs';
import { luaAutocomplete, luaLanguage } from './lua-language';
import { type SearchTerms } from './search-bar.component';
import { type LocalSignature, luaSignatureHelp } from './signature-help';
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

  readonly text = input.required<Y.Text>();
  readonly awareness = input<Awareness | null>(null);
  readonly colour = input<PresenceColour>('sky');
  readonly userName = input('you');
  readonly error = input<EngineError | null>(null);
  /** What the project declares, for calls the documentation has never heard of. */
  readonly locals = input<readonly LocalSignature[]>([]);
  readonly cursor = output<CursorInfo>();
  /** Mod-f was pressed in the editor. */
  readonly findRequested = output();
  readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');

  private view: EditorView | null = null;
  /**
   * The last query handed to the library, kept because its commands answer an unset or
   * unparseable one by opening CodeMirror's own search panel — a second find bar under ours.
   */
  private query: SearchQuery | null = null;

  /** Replaces the selection with */
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

  /**
   * What to look for. The searching itself stays the library's — cursors over a document several
   * people are editing at once is not a thing to write twice.
   */
  setSearch(q: SearchTerms): void {
    this.query = new SearchQuery(q);
    this.view?.dispatch({ effects: setSearchQuery.of(this.query) });
  }

  findNext(): void {
    this.run(findNext);
  }

  findPrevious(): void {
    this.run(findPrevious);
  }

  selectAllMatches(): void {
    this.run(selectMatches);
  }

  replaceOne(): void {
    this.run(replaceNext);
  }

  replaceEvery(): void {
    this.run(replaceAll);
  }

  /**
   * Without taking the focus: the caret stays in the find bar, so the next arrow, or the next
   * letter, goes where the reader is looking. drawSelection() paints the match it lands on
   * whether the editor is focused or not.
   */
  private run(command: (view: EditorView) => boolean): void {
    const view = this.view;
    if (!view || !this.query?.valid) return;
    command(view);
  }

  /** The whole dotted name the caret is in or beside ( */
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
  private readonly errorLineCompartment = new Compartment();

  constructor() {
    effect((cleanup) => {
      const text = this.text();
      const awareness = this.awareness();
      untracked(() => {
        this.mount(text, awareness);
      });
      cleanup(() => {
        this.view?.destroy();
        this.view = null;
      });
    });
    // Presence is a tint on a caret, not an edit: it is republished without touching the view, so
    // a collaborator joining cannot cost the reader their caret, selection, scroll or undo.
    effect(() => {
      const awareness = this.awareness();
      const hex = presenceHex(this.colour());
      const name = this.userName();
      untracked(() => {
        awareness?.setLocalStateField('user', { name, color: hex, colorLight: `${hex}33` });
      });
    });
    // The manifest may land after the reader has stopped typing, and nothing else would ask the
    // signature help to look again — hence a transaction that changes nothing.
    effect(() => {
      if (this.docs.ready()) this.view?.dispatch({});
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

  private mount(text: Y.Text, awareness: Awareness | null): void {
    this.view?.destroy();
    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightSelectionMatches(),
      // The library's search *state*, without its search *bar*: every find and replace command is
      // wrapped in a guard that opens the panel when that state is absent, so the panel is always
      // built and never shown. A query that reaches a command is already valid, so the node handed
      // to createPanel is a throwaway.
      search({ createPanel: () => ({ dom: document.createElement('div') }) }),
      searchMatchHighlight,
      lintGutter(),
      this.lintCompartment.of(this.lintSource(this.error())),
      this.errorLineCompartment.of(errorLineHighlight(this.error()?.line ?? null)),
      luaLanguage,
      luaAutocomplete((name) => this.docs.lookup(name)),
      luaHover(
        (name) => this.docs.lookup(name),
        (ns) => this.docs.peers(ns),
      ),
      luaSignatureHelp(
        (name) => this.docs.lookup(name),
        (ns) => this.docs.peers(ns),
        () => this.locals(),
      ),
      syntaxHighlighting(naucto_highlight),
      nauctoTheme,
      // Ours first: the array is tried in order, so Mod-f is claimed before the browser's own
      // find bar.
      keymap.of([
        {
          key: 'Mod-f',
          preventDefault: true,
          run: () => {
            this.findRequested.emit();
            return true;
          },
        },
        { key: 'Mod-g', preventDefault: true, run: findNext },
        { key: 'Shift-Mod-g', preventDefault: true, run: findPrevious },
        ...yUndoManagerKeymap,
        ...defaultKeymap,
        indentWithTab,
      ]),
      EditorState.tabSize.of(2),
      EditorView.updateListener.of((u) => {
        if (u.selectionSet || u.docChanged) {
          const pos = u.state.selection.main.head;
          const line = u.state.doc.lineAt(pos);
          this.cursor.emit({ line: line.number, col: pos - line.from + 1 });
        }
      }),
    ];
    extensions.push(yCollab(text, awareness));
    void this.docs.load();
    this.view = new EditorView({
      state: EditorState.create({ doc: text.toString(), extensions }),
      parent: this.host().nativeElement,
    });
    // A remount starts from a state that knows no query, so the last one is handed over again.
    if (this.query) this.view.dispatch({ effects: setSearchQuery.of(this.query) });
  }
}

/**
 * The library draws its matches only while its own panel is open, and that panel is the one thing
 * this editor never shows. The same query is read back from the state and marked here instead,
 * over what is on screen, with the match the caret sits on told apart from the others.
 */
const searchMatchHighlight: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(private readonly view: EditorView) {
      this.decorations = this.highlight();
    }

    update(u: ViewUpdate): void {
      if (
        u.docChanged ||
        u.selectionSet ||
        u.viewportChanged ||
        getSearchQuery(u.state) !== getSearchQuery(u.startState)
      )
        this.decorations = this.highlight();
    }

    private highlight(): DecorationSet {
      const { state } = this.view;
      const query = getSearchQuery(state);
      if (!query.valid) return Decoration.none;
      const { from: selFrom, to: selTo } = state.selection.main;
      const builder = new RangeSetBuilder<Decoration>();
      for (const { from, to } of this.view.visibleRanges) {
        const matches = query.getCursor(state, from, to);
        for (let m = matches.next(); !m.done; m = matches.next()) {
          const selected = m.value.from === selFrom && m.value.to === selTo;
          builder.add(m.value.from, m.value.to, selected ? selectedMatchMark : matchMark);
        }
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * The caret colour as y-codemirror.next needs it: it writes it into an inline style, so the value
 * has to be a literal — read from the token rather than copied in here, where a copy would go stale
 * in silence.
 */
function presenceHex(colour: PresenceColour): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-presence-${colour}`)
    .trim();
}

const matchMark = Decoration.mark({ class: 'cm-searchMatch' });
const selectedMatchMark = Decoration.mark({ class: 'cm-searchMatch cm-searchMatch-selected' });

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
