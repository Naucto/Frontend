import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

/** CodeMirror theme on the Naucto tokens. */
export const nauctoTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--nc-paper)',
    color: 'var(--nc-ink)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
  },
  // A fixed line height, not a ratio: the artboard's lines are whole pixels, and a ratio of the
  // font size lands between them.
  '.cm-scroller': { fontFamily: 'var(--font-mono)', letterSpacing: 'normal', lineHeight: '22px' },
  '.cm-content': { caretColor: 'var(--nc-gold)', padding: '8px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--nc-gold)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--nc-gold) 22%, transparent)',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--nc-ink) 5%, transparent)' },
  '.cm-gutters': {
    backgroundColor: 'var(--nc-paper)',
    color: 'var(--nc-gutter)',
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
    color: 'var(--nc-ink)',
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
    color: 'var(--nc-ink)',
    opacity: '1 !important',
    top: '-1.3em',
  },
  '.cm-ySelection': { opacity: '0.35' },
  '.cm-panels': { backgroundColor: 'var(--nc-panel)', color: 'var(--nc-ink)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--nc-gold) 30%, transparent)' },
  // The one the arrows just landed on, over a selection wash of the same gold: the outline is what
  // still tells it apart once the two tints have added up.
  '.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--nc-gold) 45%, transparent)',
    outline: '1px solid var(--nc-gold)',
  },
});

export const naucto_highlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--nc-hot-ink)' },
  { tag: [tags.controlKeyword, tags.operatorKeyword], color: 'var(--nc-hot-ink)' },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: 'var(--nc-sky-ink)',
  },
  { tag: tags.variableName, color: 'var(--nc-ink)' },
  { tag: tags.propertyName, color: 'var(--nc-blush-ink)' },
  { tag: tags.number, color: 'var(--nc-orange-ink)' },
  { tag: tags.string, color: 'var(--nc-jade-ink)' },
  { tag: tags.comment, color: 'var(--nc-ink-4)', fontStyle: 'italic' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--nc-ink-2)' },
  { tag: tags.bool, color: 'var(--nc-orange-ink)' },
  { tag: tags.null, color: 'var(--nc-orange-ink)' },
]);
