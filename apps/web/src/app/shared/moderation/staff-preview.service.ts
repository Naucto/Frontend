import { Injectable } from '@angular/core';
import {
  type ProjectPreviewDto,
  staffPreviewControllerContent,
  staffPreviewControllerPreview,
} from '@naucto/api-client';

import { unwrap } from '../../core/api/api-errors';

/** The latest save of a game, or the build its players got. */
export type PreviewSource = 'draft' | 'release';

/**
 * Reads a game as staff read it when they review one: whatever its state, through the backend's
 * preview routes, which count nothing and log the read. Both calls are GETs. Nothing here writes,
 * and nothing that uses it may.
 */
@Injectable({ providedIn: 'root' })
export class StaffPreviewService {
  async project(id: number): Promise<ProjectPreviewDto> {
    return unwrap(await staffPreviewControllerPreview({ path: { id: String(id) } }));
  }

  /** The game file, or null when nothing was saved or released yet. */
  async content(id: number, source: PreviewSource): Promise<Uint8Array | null> {
    const result = await staffPreviewControllerContent({
      path: { id: String(id) },
      query: { source },
      parseAs: 'blob',
    });
    if (result.response?.status === 204) {
      return null;
    }
    const file = unwrap(result) as Blob;
    return new Uint8Array(await file.arrayBuffer());
  }
}
