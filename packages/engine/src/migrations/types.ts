import type * as Y from 'yjs';

export interface MigrationWarning {
  step: 'data' | 'sound' | 'code';
  message: string;
  file?: string;
  line?: number;
}

export interface MigrationReport {
  from: number;
  to: number;
  applied: boolean;
  counts: Record<string, number>;
  warnings: MigrationWarning[];
}

/** One schema version to the next. Steps are contiguous, so a document crosses them in order. */
export interface MigrationStep {
  from: number;
  to: number;
  run: (doc: Y.Doc, report: MigrationReport) => void;
}
