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
