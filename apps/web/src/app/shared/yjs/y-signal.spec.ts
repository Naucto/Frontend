import { TestBed } from '@angular/core/testing';
import { EditableGame } from '@naucto/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { yTextField } from './y-signal';

describe('yTextField', () => {
  let doc: Y.Doc;
  let mayWrite: boolean;
  let field: ReturnType<typeof yTextField>;

  beforeEach(() => {
    doc = new Y.Doc();
    mayWrite = true;
    const game = new EditableGame(doc, () => mayWrite);
    TestBed.resetTestingModule();
    field = TestBed.runInInjectionContext(() => yTextField(game, doc.getText('name')));
  });

  it('writes a local edit into the document', () => {
    field.set('Snake');

    expect(doc.getText('name').toString()).toBe('Snake');
    expect(field()).toBe('Snake');
  });

  it('follows an edit that arrived from a collaborator', () => {
    const peer = new Y.Doc();
    peer.getText('name').insert(0, 'Snake II');

    Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer));

    expect(field()).toBe('Snake II');
  });

  it('keeps what the document holds when the game may not be written', () => {
    field.set('Snake');
    mayWrite = false;

    field.set('Worm');
    field.update((name) => `${name}!`);

    expect(doc.getText('name').toString()).toBe('Snake');
    expect(field()).toBe('Snake');
  });
});
