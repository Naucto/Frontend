import {
  projectContentControllerGetCheckpoint,
  projectContentControllerGetVersion,
} from '@naucto/api-client';
import { isFromFutureSchema, migrateGame } from '@naucto/engine';
import * as Y from 'yjs';

import type { VersionRow } from '../../../shared/queries/projects.queries';

/**
 * A saved version as a document of its own, brought forward to the current schema: what a restore
 * copies and what a diff compares are the current schema's shape, and would miss what sits in an
 * older one. The caller owns the document and destroys it.
 */
export async function loadVersionDoc(projectId: string, row: VersionRow): Promise<Y.Doc> {
  const path = { id: projectId };
  const res = row.release
    ? await projectContentControllerGetCheckpoint({
        path: { ...path, name: row.name },
        parseAs: 'blob',
      })
    : await projectContentControllerGetVersion({
        path: { ...path, version: row.name },
        parseAs: 'blob',
      });
  const blob = res.data;
  if (!blob || blob.size === 0) {
    throw new Error('empty version');
  }
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, new Uint8Array(await blob.arrayBuffer()));
    if (isFromFutureSchema(doc)) {
      throw new Error('version from a newer schema');
    }
    migrateGame(doc);
  } catch (error) {
    doc.destroy();
    throw error;
  }
  return doc;
}
