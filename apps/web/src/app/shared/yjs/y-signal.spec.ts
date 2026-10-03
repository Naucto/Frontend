import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { yTextField } from './y-signal';

describe('yTextField', () => {
  let doc: Y.Doc;
  let field: ReturnType<typeof yTextField>;

  beforeEach(() => {
    doc = new Y.Doc();
    TestBed.resetTestingModule();
    field = TestBed.runInInjectionContext(() => yTextField(doc.getText('name')));
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
});
