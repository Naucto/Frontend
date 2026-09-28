import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { changedRange, computeAiMarks, withoutProposal } from './work-session.service';

const slice = (text: string, range: [number, number]): string => text.slice(range[0], range[1]);

describe('marking what an accepted change moved', () => {
  it('marks only the lines that differ, not the whole file', () => {
    // A `code` operation replaces the whole file, so marking the file would be marking everything and
    // saying nothing. These lines are shared with what came before and must not be highlighted.
    const before = ['-- header', 'local a = 1', 'local b = 2', '-- footer'].join('\n');
    const after = ['-- header', 'local a = 1', 'local b = 99', 'local c = 3', '-- footer'].join(
      '\n',
    );
    const marked = slice(after, changedRange(before, after));
    expect(marked).toBe('local b = 99\nlocal c = 3\n');
    expect(marked).not.toContain('header');
    expect(marked).not.toContain('footer');
  });

  it('marks a change at the very start or the very end', () => {
    const before = 'one\ntwo\nthree';
    expect(slice(before, changedRange('ONE\ntwo\nthree', before))).toBe('one\n');
    expect(slice(before, changedRange('one\ntwo\nTHREE', before))).toBe('three');
  });

  it('marks nothing when the text did not change', () => {
    const same = 'unchanged\n';
    expect(changedRange(same, same)).toEqual([0, 0]);
  });

  it('marks the whole file when every line changed', () => {
    const before = 'a\nb';
    const after = 'x\ny';
    expect(slice(after, changedRange(before, after))).toBe('x\ny');
  });

  it('follows the text when a colleague types above it', () => {
    // The point of storing relative positions rather than line numbers: inserting above shifts every
    // number, and the mark has to move with the text it describes.
    const doc = new Y.Doc();
    const text = doc.getText('main');
    text.insert(0, 'local b = 2\n');
    const from = Y.createRelativePositionFromTypeIndex(text, 0);
    const to = Y.createRelativePositionFromTypeIndex(text, text.length);
    text.insert(0, '-- a colleague was here\n');
    const start = Y.createAbsolutePositionFromRelativePosition(from, doc)?.index ?? -1;
    const end = Y.createAbsolutePositionFromRelativePosition(to, doc)?.index ?? -1;
    expect(doc.getText('main').toString().slice(start, end)).toBe('local b = 2\n');
  });

  it('collapses to nothing once the text it covered is gone, so a reverted mark draws nothing', () => {
    // Not because the positions stop resolving — they do resolve, to where the text was — but because
    // both ends land on the same index. That empty range is what the editor refuses to decorate, so a
    // mark for a reverted change cannot end up drawn over whatever now sits in its place.
    const doc = new Y.Doc();
    const text = doc.getText('main');
    text.insert(0, 'written by the assistant\n');
    const from = Y.createRelativePositionFromTypeIndex(text, 0);
    const to = Y.createRelativePositionFromTypeIndex(text, text.length);
    text.delete(0, text.length);
    const start = Y.createAbsolutePositionFromRelativePosition(from, doc)?.index;
    const end = Y.createAbsolutePositionFromRelativePosition(to, doc)?.index;
    expect(start).toBe(end);
  });
});

describe('which regions an accepted change is marked at', () => {
  const withFile = (text: string): { doc: Y.Doc; file: Y.Map<Y.Text> } => {
    const doc = new Y.Doc();
    const file = new Y.Map<Y.Text>();
    doc.getMap('code.files').set('main', file);
    file.set('text', new Y.Text(text));
    return { doc, file };
  };
  const before = (doc: Y.Doc): Map<string, string> => {
    const files = new Map<string, string>();
    for (const [id, file] of doc.getMap<Y.Map<Y.Text>>('code.files')) {
      const text = file.get('text');
      if (text instanceof Y.Text) files.set(id, text.toString());
    }
    return files;
  };
  const fileText = (doc: Y.Doc, id: string): Y.Text => {
    const text = doc.getMap<Y.Map<Y.Text>>('code.files').get(id)?.get('text');
    if (!(text instanceof Y.Text)) throw new Error(`${id} has no text`);
    return text;
  };

  it('marks the lines that moved, and no others', () => {
    const { doc, file } = withFile('-- header\nlocal b = 2\n-- footer');
    const was = before(doc);
    const text = file.get('text');
    if (!(text instanceof Y.Text)) throw new Error('no text');
    text.delete(0, text.length);
    text.insert(0, '-- header\nlocal b = 99\n-- footer');

    const marks = computeAiMarks(doc, was, 'p1', 'Tidy up');
    expect(marks).toHaveLength(1);
    const [mark] = marks;
    expect(mark?.fileId).toBe('main');
    expect(mark?.proposalId).toBe('p1');
    expect(mark?.title).toBe('Tidy up');
    // The marked region reads as it is now, not as it was: the person is looking at the document.
    expect(text.toString().slice(resolve(doc, mark!.from), resolve(doc, mark!.to))).toBe(
      'local b = 99\n',
    );
  });

  it('marks nothing when the change left every file as it found it', () => {
    const { doc } = withFile('unchanged');
    const was = before(doc);
    expect(computeAiMarks(doc, was, 'p1', 'Nothing')).toEqual([]);
  });

  it('marks only the files the change touched', () => {
    const { doc } = withFile('a');
    addFile(doc, 'other', 'untouched');
    const was = before(doc);
    const text = fileText(doc, 'main');
    text.delete(0, text.length);
    text.insert(0, 'changed');
    const marks = computeAiMarks(doc, was, 'p1', 'One file');
    expect(marks.map((mark) => mark.fileId)).toEqual(['main']);
  });

  it('marks nothing for a file that did not exist before the change', () => {
    const doc = new Y.Doc();
    addFile(doc, 'added', 'brand new');
    expect(computeAiMarks(doc, new Map(), 'p1', 'New file')).toEqual([]);
  });
});

const resolve = (doc: Y.Doc, position: Y.RelativePosition): number =>
  Y.createAbsolutePositionFromRelativePosition(position, doc)?.index ?? -1;

/** What a whole-file `code` operation does: the file's text becomes something else entirely. */
function rewrite(text: Y.Text, next: string): void {
  text.delete(0, text.length);
  text.insert(0, next);
}

function addFile(doc: Y.Doc, id: string, text: string): void {
  const file = new Y.Map<Y.Text>();
  file.set('text', new Y.Text(text));
  doc.getMap<Y.Map<Y.Text>>('code.files').set(id, file);
}

describe('marks surviving a colleague, and leaving with a revert', () => {
  it('still points at the same text after somebody types above it', () => {
    // The reason the service stores relative positions: a line number would drift the moment anyone
    // typed above, and the highlight would end up on the wrong lines.
    const doc = new Y.Doc();
    const file = new Y.Map<Y.Text>();
    doc.getMap<Y.Map<Y.Text>>('code.files').set('main', file);
    const text = new Y.Text('-- header\nlocal b = 2\n-- footer');
    file.set('text', text);
    const was = new Map([['main', text.toString()]]);
    rewrite(text, '-- header\nlocal b = 99\n-- footer');
    const [mark] = computeAiMarks(doc, was, 'p1', 'Tidy up');
    expect(mark).toBeDefined();

    text.insert(0, '-- a colleague was here\n');
    const start = resolve(doc, mark!.from);
    const end = resolve(doc, mark!.to);
    expect(text.toString().slice(start, end)).toBe('local b = 99\n');
  });

  it('drops a reverted change’s marks and keeps the rest', () => {
    const doc = new Y.Doc();
    const file = new Y.Map<Y.Text>();
    doc.getMap<Y.Map<Y.Text>>('code.files').set('main', file);
    const text = new Y.Text('before');
    file.set('text', text);
    rewrite(text, 'after the first change');
    const first = computeAiMarks(doc, new Map([['main', 'before']]), 'p1', 'First');
    rewrite(text, 'after the second change');
    const second = computeAiMarks(
      doc,
      new Map([['main', 'after the first change']]),
      'p2',
      'Second',
    );
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);

    const all = [...second, ...first];
    const kept = withoutProposal(all, 'p1');
    expect(kept.map((mark) => mark.proposalId)).toEqual(['p2']);
    // Undoing one change must not empty the list.
    expect(withoutProposal(all, 'p2').map((mark) => mark.proposalId)).toEqual(['p1']);
  });
});
