import { TestBed } from '@angular/core/testing';
import { TRANSLOCO_TRANSPILER, TranslocoService } from '@jsverse/transloco';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { WorkSessionService } from './work-session.service';

/**
 * Which document an accepted change is measured in.
 *
 * The mark is diffed against the state the server sent back, not the live document. The live one
 * has everything typed while the request was in flight, and any file the person opened, so diffing
 * against it presents all of that as the assistant's work — in the one place somebody looks to find
 * out what the assistant changed. This exercises the service's choice of document, which testing the
 * diff function alone does not: given the right document it behaves correctly either way.
 */
describe('marking an accepted change, against which document', () => {
  let service: WorkSessionService;
  /** The private method, reached directly: this is about what it diffs. */
  const mark = (before: Map<string, string>, update: Uint8Array): void => {
    (
      service as unknown as {
        markAiChange: (a: string, b: string, c: Map<string, string>, d: Uint8Array) => void;
      }
    ).markAiChange('p1', 'Change', before, update);
  };
  const index = (relative: unknown): number =>
    Y.createAbsolutePositionFromRelativePosition(relative as Y.RelativePosition, service.doc)!
      .index;

  beforeEach(() => {
    // The session injects these for presence and labels; nothing here uses them.
    TestBed.configureTestingModule({
      providers: [
        WorkSessionService,
        QueryClient,
        { provide: TranslocoService, useValue: { selectTranslate: () => of('') } },
        {
          provide: TRANSLOCO_TRANSPILER,
          useValue: { transloco: () => of(''), handle: (s: string) => s },
        },
      ],
    });
    service = TestBed.inject(WorkSessionService);
  });

  const addFile = (doc: Y.Doc, id: string, text: string): Y.Text => {
    const files = doc.getMap<Y.Map<Y.Text>>('code.files');
    const file = new Y.Map<Y.Text>();
    const body = new Y.Text();
    doc.transact(() => {
      files.set(id, file);
      file.set('text', body);
      body.insert(0, text);
    });
    return body;
  };
  /** The live text of a file, which is the point: the person types into this one. */
  const textOf = (id: string): Y.Text =>
    service.doc.getMap<Y.Map<Y.Text>>('code.files').get(id)!.get('text')!;

  it('marks the state the server applied, not what the person typed in the gap', () => {
    // Before the request: the file the change will rewrite.
    addFile(service.doc, 'main', 'before');
    const before = new Map([['main', 'before']]);

    // The state the request carried.
    const snapshot = Y.encodeStateAsUpdate(service.doc);

    // While it is out, a person types and opens a file of their own.
    textOf('main').insert(textOf('main').length, ' and more');
    addFile(service.doc, 'mine', 'a file the change never touched');

    // What the server sent back: the same document with the file rewritten, and neither of the
    // above. Built from the snapshot, so the two share the types the way the real reply would.
    const applied = new Y.Doc();
    Y.applyUpdate(applied, snapshot);
    const body = applied.getMap<Y.Map<Y.Text>>('code.files').get('main')!.get('text')!;
    body.delete(0, body.length);
    body.insert(0, 'after');
    const update = Y.encodeStateAsUpdate(applied);

    // The live document is brought in line with the answer, as applying it would.
    Y.applyUpdate(service.doc, update, WorkSessionService.APPLIED_ORIGIN);
    mark(before, update);

    const marks = service.aiMarks();
    expect(marks.map((m) => m.fileId)).toEqual(['main']);
    const text = service.doc.getMap<Y.Map<Y.Text>>('code.files').get('main')!.get('text')!;
    const slice = text.toString().slice(index(marks[0]!.from), index(marks[0]!.to));
    // "after", not the person's "and more".
    expect(slice).toBe('after');
  });
});
