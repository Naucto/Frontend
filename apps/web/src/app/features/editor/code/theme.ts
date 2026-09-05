import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

/** CodeMirror theme on the Naucto tokens: inset surface, gold caret, presence-coloured remote carets. */
export const nauctoTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--nc-paper)',
    color: 'var(--nc-ink)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
  },
  // 22px, not a ratio: the artboard sets 13/22 and 1.6 lands on 20.8, so every screenful of code
  // drifted a little further off the design's baseline the further down you read.
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '22px' },
  '.cm-content': { caretColor: 'var(--nc-gold)', padding: '8px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--nc-gold)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--nc-gold) 22%, transparent)',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--nc-ink) 5%, transparent)' },
  '.cm-gutters': {
    backgroundColor: 'var(--nc-paper)',
    color: 'var(--nc-gutter)',
    // The design separates the numbers from the code with a hairline rather than leaving them to
    // float in the same field.
    border: 'none',
    borderRight: '1px solid var(--nc-line)',
    fontFamily: 'var(--font-mono)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--nc-ink-2)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 4px', minWidth: '33px' },
  '.cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--nc-sky) 25%, transparent)',
    outline: 'none',
  },
  '.cm-lintRange-error': { backgroundImage: 'none', borderBottom: '2px dotted var(--nc-hot)' },
  // The design marks a failing line three ways: the gutter number, the line itself, and the token.
  '.cm-lint-marker-error': { color: 'var(--nc-hot-ink)' },
  '.cm-gutterElement.cm-error-line': { color: 'var(--nc-hot-ink)' },
  '.cm-line.cm-error-line': {
    backgroundColor: 'var(--nc-gold-wash)',
    borderLeft: '2px solid var(--nc-gold)',
    marginLeft: '-14px',
    paddingLeft: '12px',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--nc-raised)',
    border: '1px solid var(--nc-line-strong)',
    borderRadius: '3px',
    color: 'var(--nc-ink)',
    fontFamily: 'var(--font-ui)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    padding: '2px 8px',
    fontFamily: 'var(--font-mono)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--nc-gold)',
    color: '#17140f',
  },
  '.cm-completionDetail': { color: 'var(--nc-ink-3)', marginLeft: '8px', fontStyle: 'normal' },
  '.cm-completionInfo': {
    backgroundColor: 'var(--nc-raised)',
    border: '1px solid var(--nc-line-strong)',
    color: 'var(--nc-ink-body)',
    fontFamily: 'var(--font-ui)',
    padding: '6px 8px',
  },
  '.cm-ySelectionInfo': {
    fontFamily: 'var(--font-ui)',
    fontSize: '9px',
    letterSpacing: '.04em',
    textTransform: 'uppercase',
    padding: '1px 4px',
    borderRadius: '2px',
    color: '#17140f',
    opacity: '1 !important',
    top: '-1.3em',
  },
  '.cm-ySelection': { opacity: '0.35' },
  '.cm-panels': { backgroundColor: 'var(--nc-panel)', color: 'var(--nc-ink)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--nc-gold) 30%, transparent)' },
});

export const naucto_highlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--nc-hot-ink)' },
  { tag: [t.controlKeyword, t.operatorKeyword], color: 'var(--nc-hot-ink)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--nc-sky-ink)' },
  { tag: [t.variableName, t.propertyName], color: 'var(--nc-ink)' },
  { tag: t.number, color: 'var(--nc-orange-ink)' },
  { tag: t.string, color: 'var(--nc-jade-ink)' },
  { tag: t.comment, color: 'var(--nc-ink-4)', fontStyle: 'italic' },
  { tag: [t.operator, t.punctuation], color: 'var(--nc-ink-2)' },
  { tag: t.bool, color: 'var(--nc-orange-ink)' },
  { tag: t.null, color: 'var(--nc-orange-ink)' },
]);
