import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import type { AiMark } from '../work-session/work-session.service';
import { aiMarkHighlight } from './code-editor.component';

const mark = (text: Y.Text, from: number, to: number, title: string): AiMark => ({
  proposalId: 'p1',
  fileId: 'main',
  title,
  from: Y.createRelativePositionFromTypeIndex(text, from),
  to: Y.createRelativePositionFromTypeIndex(text, to),
});

/** What the editor actually draws, read out of the DOM: the marked runs and what each covers. */
const marked = (host: HTMLElement): string[] =>
  [...host.querySelectorAll('.cm-ai-line')].map((node) => node.textContent ?? '');

const open = (
  text: string,
  entry: AiMark,
  shared: Y.Text,
): { view: EditorView; host: HTMLElement } => {
  const host = document.createElement('div');
  const view = new EditorView({
    state: EditorState.create({ doc: text, extensions: [aiMarkHighlight([entry], shared)] }),
    parent: host,
  });
  return { view, host };
};

describe('the AI highlight as the editor draws it', () => {
  it('moves with the text when somebody types above it', () => {
    // The facet this lives in is recomputed on document changes. Without that dependency it is
    // computed once and the highlight stays on the same character offsets while the text above it
    // moves, so it covers the wrong lines the moment anybody types.
    const doc = new Y.Doc();
    const file = new Y.Map<Y.Text>();
    doc.getMap<Y.Map<Y.Text>>('code.files').set('main', file);
    const shared = new Y.Text('world');
    file.set('text', shared);

    const { view, host } = open('world', mark(shared, 0, 5, 'from the assistant'), shared);
    expect(marked(host)).toEqual(['world']);

    shared.insert(0, 'abc\n');
    view.dispatch({ changes: { from: 0, insert: 'abc\n' } });

    // Still the same word, not the tail of it.
    expect(marked(host)).toEqual(['world']);
    view.destroy();
  });

  it('draws nothing once the text it covered is gone', () => {
    const doc = new Y.Doc();
    const file = new Y.Map<Y.Text>();
    doc.getMap<Y.Map<Y.Text>>('code.files').set('main', file);
    const shared = new Y.Text('from the assistant');
    file.set('text', shared);

    const { view, host } = open('from the assistant', mark(shared, 0, shared.length, 'x'), shared);
    expect(marked(host)).toEqual(['from the assistant']);

    shared.delete(0, shared.length);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length } });
    expect(marked(host)).toEqual([]);
    view.destroy();
  });
});
