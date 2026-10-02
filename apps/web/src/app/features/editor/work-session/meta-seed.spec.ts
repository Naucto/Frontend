import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { seedText } from './meta-seed';

const text = (value?: string): Y.Text => {
  const doc = new Y.Doc();
  const t = doc.getText('projectName');
  if (value !== undefined) t.insert(0, value);
  return t;
};

describe('seedText', () => {
  it('writes the value into an empty text', () => {
    const t = text();
    seedText(t, 'Untitled game');
    expect(t.toString()).toBe('Untitled game');
  });

  it('leaves a text that already holds the value alone', () => {
    // The ordinary re-join: the second editor must not write a second copy.
    const t = text('Untitled game');
    seedText(t, 'Untitled game');
    expect(t.toString()).toBe('Untitled game');
  });

  it('folds a name that two joins wrote back to a single copy', () => {
    // The bug: two editors both saw an empty text, both wrote, and Yjs kept both. The result was
    // one character over the API's limit, which then stopped the project being saved at all.
    const t = text('Untitled gameUntitled game');
    seedText(t, 'Untitled game');
    expect(t.toString()).toBe('Untitled game');
  });

  it('leaves a name a person chose alone', () => {
    // A rename in the editor must not be undone by a peer joining.
    const t = text('My Great Game');
    seedText(t, 'Untitled game');
    expect(t.toString()).toBe('My Great Game');
  });

  it('writes nothing for an empty value', () => {
    const t = text();
    seedText(t, '');
    expect(t.toString()).toBe('');
  });
});
