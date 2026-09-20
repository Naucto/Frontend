/**
 * Migrates every stored game document of a deployment in place.
 *
 * A game lives in S3 only: its autosaves (`save/<id>/<epochMs>`), its named versions
 * (`checkpoint/<id>/<name>`) and, once published, an independent copy at `release/<id>`. Each is a
 * Yjs update, and the editor migrates one transparently when it opens it -- but a release is never
 * opened by the editor, a checkpoint only when restored, and the `Project` row keeps a size
 * breakdown of the latest autosave stamped with the schema it was computed from. This brings all
 * of them forward at once, with the same engine code the editor runs.
 *
 * It runs inside the Backend image, where `pg`, `@aws-sdk/client-s3` and the Backend's own
 * `content-size` module live; `tools/migrate-games.mjs` builds the bundle it runs as.
 *
 *   node migrate-games.cjs --dry-run [--project <id>]   reads everything, writes nothing
 *   node migrate-games.cjs --apply   [--project <id>]   rewrites what is behind
 *   node migrate-games.cjs --check <id>                 prints the schema of each object of one game
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import * as Y from 'yjs';

import { GAME_SCHEMA_VERSION } from '../packages/engine/src/game/keys';
import {
  isFromFutureSchema,
  migrateGame,
  type MigrationWarning,
  needsMigration,
  schemaVersionOf,
} from '../packages/engine/src/migrations';

// ---- pure core ------------------------------------------------------------

export interface BlobMigration {
  bytes: Uint8Array | null;
  from: number;
  to: number;
  warnings: string[];
  /** Written by a newer schema than this build knows: there is no reading it, let alone rewriting it. */
  future: boolean;
}

const describeWarning = (w: MigrationWarning): string => {
  const where =
    w.file === undefined ? '' : `${w.file}${w.line === undefined ? '' : `:${String(w.line)}`}: `;
  return `[${w.step}] ${where}${w.message}`;
};

/** Brings one stored update to the current schema. Idempotent: a second pass returns null bytes. */
export function migrateBlob(bytes: Uint8Array): BlobMigration {
  const doc = new Y.Doc();
  try {
    if (bytes.byteLength > 0) Y.applyUpdate(doc, bytes);
    const from = schemaVersionOf(doc);
    const untouched = { bytes: null, from, to: GAME_SCHEMA_VERSION, warnings: [] };
    if (isFromFutureSchema(doc)) return { ...untouched, future: true };
    if (!needsMigration(doc)) return { ...untouched, future: false };

    const report = migrateGame(doc);
    return {
      bytes: Y.encodeStateAsUpdate(doc),
      from: report.from,
      to: report.to,
      warnings: report.warnings.map(describeWarning),
      future: false,
    };
  } finally {
    doc.destroy();
  }
}

// ---- what the Backend image provides --------------------------------------

interface PgClient {
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

interface PgModule {
  Client: new (config: { connectionString: string }) => PgClient;
}

/** The output type rides on the command so that `send` can be typed; the SDK's own shape. */
interface S3Command<Output> {
  readonly _output?: Output;
}

interface S3Client {
  send<Output>(command: S3Command<Output>): Promise<Output>;
  destroy(): void;
}

interface ListOutput {
  Contents?: { Key?: string }[];
  NextContinuationToken?: string;
}

interface GetOutput {
  Body?: { transformToByteArray(): Promise<Uint8Array> };
  ContentType?: string;
}

interface S3Module {
  S3Client: new (config: {
    endpoint: string;
    region: string;
    credentials: { accessKeyId: string; secretAccessKey: string };
    forcePathStyle: boolean;
  }) => S3Client;
  ListObjectsV2Command: new (input: {
    Bucket: string;
    Prefix: string;
    ContinuationToken?: string;
  }) => S3Command<ListOutput>;
  HeadObjectCommand: new (input: { Bucket: string; Key: string }) => S3Command<unknown>;
  GetObjectCommand: new (input: { Bucket: string; Key: string }) => S3Command<GetOutput>;
  PutObjectCommand: new (input: {
    Bucket: string;
    Key: string;
    Body: Uint8Array;
    ContentType?: string;
    CacheControl?: string;
  }) => S3Command<unknown>;
  PutObjectAclCommand: new (input: {
    Bucket: string;
    Key: string;
    ACL: 'public-read';
  }) => S3Command<unknown>;
}

interface ContentSizeBreakdown extends Record<string, unknown> {
  total: number;
  schemaVersion: number;
}

interface ContentSizeModule {
  computeContentSize: (blob: Uint8Array) => ContentSizeBreakdown;
}

const DEFAULT_CONTENT_SIZE_MODULE = '/app/dist/routes/project/content-size.js';
const RELEASE_CACHE_CONTROL = 'no-cache';

const nodeRequire = createRequire(import.meta.url);

// ---- report ---------------------------------------------------------------

type ObjectStatus = 'migrated' | 'skipped' | 'future' | 'failed';

interface ObjectResult {
  key: string;
  status: ObjectStatus;
  from?: number;
  to?: number;
  bytes?: number;
  warnings: string[];
  error?: string;
}

interface ProjectResult {
  id: number;
  published: boolean;
  objects: ObjectResult[];
  contentSize?: { total: number; schemaVersion: number; written: boolean };
  notes: string[];
}

interface Report {
  mode: 'dry-run' | 'apply';
  startedAt: string;
  finishedAt: string;
  bucket: string;
  schemaVersion: number;
  projects: ProjectResult[];
  totals: Record<ObjectStatus, number> & { projects: number; contentSizes: number };
  transitions: Record<string, number>;
  warnings: string[];
}

// ---- arguments and environment --------------------------------------------

type Args =
  { mode: 'dry-run' | 'apply'; project: number | null } | { mode: 'check'; project: number };

const USAGE = `usage: migrate-games (--dry-run | --apply) [--project <id>]
       migrate-games --check <id>`;

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function parseId(flag: string, value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value)) throw new Error(`${flag} needs a project id`);
  return Number(value);
}

function parseArgs(argv: string[]): Args {
  let dryRun = false;
  let apply = false;
  let project: number | null = null;
  let check: number | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--apply') apply = true;
    else if (arg === '--project') project = parseId(arg, argv[++i]);
    else if (arg === '--check') check = parseId(arg, argv[++i]);
    else throw new Error(`unknown argument ${arg}`);
  }
  if (check !== null) {
    if (dryRun || apply || project !== null) throw new Error('--check stands alone');
    return { mode: 'check', project: check };
  }
  if (dryRun === apply) throw new Error('exactly one of --dry-run or --apply is required');
  return { mode: apply ? 'apply' : 'dry-run', project };
}

function env(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`missing env ${name}`);
  return value;
}

// ---- storage --------------------------------------------------------------

interface Store {
  sdk: S3Module;
  s3: S3Client;
  bucket: string;
}

const hasName = (e: unknown, name: string): boolean =>
  typeof e === 'object' && e !== null && 'name' in e && e.name === name;

const isNotFound = (e: unknown): boolean =>
  hasName(e, 'NotFound') ||
  (typeof e === 'object' &&
    e !== null &&
    '$metadata' in e &&
    (e.$metadata as { httpStatusCode?: number }).httpStatusCode === 404);

async function listKeys(store: Store, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await store.s3.send(
      new store.sdk.ListObjectsV2Command({
        Bucket: store.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const o of page.Contents ?? []) if (o.Key !== undefined) keys.push(o.Key);
    token = page.NextContinuationToken;
  } while (token !== undefined);
  return keys;
}

async function exists(store: Store, key: string): Promise<boolean> {
  try {
    await store.s3.send(new store.sdk.HeadObjectCommand({ Bucket: store.bucket, Key: key }));
    return true;
  } catch (e) {
    if (isNotFound(e)) return false;
    throw e;
  }
}

async function readObject(
  store: Store,
  key: string,
): Promise<{ bytes: Uint8Array; contentType: string | undefined }> {
  const out = await store.s3.send(
    new store.sdk.GetObjectCommand({ Bucket: store.bucket, Key: key }),
  );
  if (out.Body === undefined) throw new Error('empty response body');
  return { bytes: await out.Body.transformToByteArray(), contentType: out.ContentType };
}

/**
 * Writes an object back under its own key, and a release back the way the Backend publishes one.
 *
 * Per-object ACLs are an S3 feature, not an S3-API feature: MinIO -- what the dev stack runs --
 * answers `NotImplemented`, and there the bucket policy grants the same read. Swallowing exactly
 * that one code keeps the rewrite working against both, while any real failure still surfaces
 * (mirrors `setObjectPublicRead` in the Backend's `s3.service.ts`).
 */
async function writeObject(
  store: Store,
  key: string,
  bytes: Uint8Array,
  contentType: string | undefined,
): Promise<void> {
  const release = key.startsWith('release/');
  await store.s3.send(
    new store.sdk.PutObjectCommand({
      Bucket: store.bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: release ? RELEASE_CACHE_CONTROL : undefined,
    }),
  );
  if (!release) return;
  try {
    await store.s3.send(
      new store.sdk.PutObjectAclCommand({ Bucket: store.bucket, Key: key, ACL: 'public-read' }),
    );
  } catch (e) {
    if (!hasName(e, 'NotImplemented')) throw e;
  }
}

const epochOf = (saveKey: string): number => Number(saveKey.slice(saveKey.lastIndexOf('/') + 1));

async function objectsOf(
  store: Store,
  id: number,
  published: boolean,
): Promise<{ keys: string[]; latestSave: string | null; notes: string[] }> {
  const saves = await listKeys(store, `save/${String(id)}/`);
  const checkpoints = await listKeys(store, `checkpoint/${String(id)}/`);
  const keys = [...saves, ...checkpoints];
  const notes: string[] = [];
  if (published) {
    const release = `release/${String(id)}`;
    if (await exists(store, release)) keys.push(release);
    else notes.push(`published but ${release} is missing`);
  }
  const latestSave = saves.reduce<string | null>(
    (best, key) => (best === null || epochOf(key) > epochOf(best) ? key : best),
    null,
  );
  return { keys, latestSave, notes };
}

// ---- the run --------------------------------------------------------------

interface Run {
  args: Args;
  store: Store;
  db: PgClient;
  computeContentSize: ContentSizeModule['computeContentSize'] | null;
  report: Report;
}

interface ProjectRow {
  id: number;
  published: boolean;
}

// Prisma names the table after the model (`"Project"`, no `@@map`) and `publishedAt` after the
// field, while the two size columns are the ones the model maps to snake_case.
async function listProjects(db: PgClient, only: number | null): Promise<ProjectRow[]> {
  const where = only === null ? '' : 'WHERE id = $1';
  const { rows } = await db.query(
    `SELECT id, "publishedAt" IS NOT NULL AS published FROM "Project" ${where} ORDER BY id`,
    only === null ? [] : [only],
  );
  return rows.map((r) => ({ id: Number(r['id']), published: r['published'] === true }));
}

async function storeContentSize(
  db: PgClient,
  id: number,
  breakdown: ContentSizeBreakdown,
): Promise<void> {
  await db.query(
    'UPDATE "Project" SET content_size = $1::jsonb, content_size_total = $2 WHERE id = $3',
    [JSON.stringify(breakdown), breakdown.total, id],
  );
}

async function processObject(
  run: Run,
  key: string,
): Promise<{ result: ObjectResult; migrated: Uint8Array | null }> {
  try {
    const { bytes, contentType } = await readObject(run.store, key);
    const out = migrateBlob(bytes);
    const base = {
      key,
      from: out.from,
      to: out.to,
      bytes: bytes.byteLength,
      warnings: out.warnings,
    };
    if (out.future) return { result: { ...base, status: 'future' }, migrated: null };
    if (out.bytes === null) return { result: { ...base, status: 'skipped' }, migrated: null };
    if (run.args.mode === 'apply') await writeObject(run.store, key, out.bytes, contentType);
    return {
      result: { ...base, status: 'migrated', bytes: out.bytes.byteLength },
      migrated: out.bytes,
    };
  } catch (e) {
    return {
      result: { key, status: 'failed', warnings: [], error: errorMessage(e) },
      migrated: null,
    };
  }
}

function describeTransition(o: ObjectResult): string {
  if (o.status === 'failed') return ` (${o.error ?? 'unknown error'})`;
  if (o.from === undefined || o.to === undefined) return '';
  return o.status === 'migrated'
    ? ` ${String(o.from)}→${String(o.to)}`
    : ` (schema ${String(o.from)})`;
}

async function processProject(run: Run, row: ProjectRow): Promise<ProjectResult> {
  const result: ProjectResult = { id: row.id, published: row.published, objects: [], notes: [] };
  let listed: Awaited<ReturnType<typeof objectsOf>>;
  try {
    listed = await objectsOf(run.store, row.id, row.published);
  } catch (e) {
    result.notes.push(`listing failed: ${errorMessage(e)}`);
    return result;
  }
  result.notes.push(...listed.notes);

  for (const key of listed.keys) {
    const { result: object, migrated } = await processObject(run, key);
    result.objects.push(object);
    if (object.status !== 'skipped') {
      console.log(`  #${String(row.id)} ${key}: ${object.status}${describeTransition(object)}`);
    }
    for (const w of object.warnings) console.log(`      ${w}`);

    if (migrated === null || key !== listed.latestSave || run.computeContentSize === null) continue;
    try {
      const breakdown = run.computeContentSize(migrated);
      const written = run.args.mode === 'apply';
      if (written) await storeContentSize(run.db, row.id, breakdown);
      result.contentSize = {
        total: breakdown.total,
        schemaVersion: breakdown.schemaVersion,
        written,
      };
    } catch (e) {
      result.notes.push(`content size not recomputed: ${errorMessage(e)}`);
    }
  }
  return result;
}

function tally(report: Report): void {
  for (const p of report.projects) {
    report.totals.projects += 1;
    if (p.contentSize !== undefined) report.totals.contentSizes += 1;
    report.warnings.push(...p.notes.map((n) => `#${String(p.id)}: ${n}`));
    for (const o of p.objects) {
      report.totals[o.status] += 1;
      if (o.status === 'migrated') {
        const t = `${String(o.from)}→${String(o.to)}`;
        report.transitions[t] = (report.transitions[t] ?? 0) + 1;
      }
      report.warnings.push(...o.warnings.map((w) => `#${String(p.id)} ${o.key}: ${w}`));
    }
  }
}

function printSummary(report: Report, path: string): void {
  const t = report.totals;
  console.log('');
  console.log(
    `migrate-games ${report.mode} — bucket ${report.bucket}, schema ${String(report.schemaVersion)}`,
  );
  console.log(`projects scanned: ${String(t.projects)}`);
  console.log(
    `objects: scanned ${String(t.migrated + t.skipped + t.future + t.failed)}, migrated ${String(t.migrated)}, skipped ${String(t.skipped)}, future ${String(t.future)}, failed ${String(t.failed)}`,
  );
  const transitions = Object.entries(report.transitions).map(([k, n]) => `${k}: ${String(n)}`);
  console.log(`transitions: ${transitions.length > 0 ? transitions.join(', ') : 'none'}`);
  console.log(
    `content sizes recomputed: ${String(t.contentSizes)}${report.mode === 'apply' ? '' : ' (not written)'}`,
  );
  if (report.warnings.length > 0) {
    console.log(`warnings (${String(report.warnings.length)}):`);
    for (const w of report.warnings) console.log(`  ${w}`);
  }
  const failed = report.projects.flatMap((p) =>
    p.objects
      .filter((o) => o.status === 'failed')
      .map((o) => `  #${String(p.id)} ${o.key}: ${o.error ?? ''}`),
  );
  if (failed.length > 0) {
    console.log(`failed (${String(failed.length)}):`);
    for (const f of failed) console.log(f);
  }
  console.log(`report: ${path}`);
}

async function check(run: Run, id: number): Promise<void> {
  const [row] = await listProjects(run.db, id);
  if (row === undefined) throw new Error(`no project ${String(id)}`);
  const { keys, latestSave, notes } = await objectsOf(run.store, id, row.published);
  console.log(
    `#${String(id)} ${row.published ? 'published' : 'unpublished'}, ${String(keys.length)} objects, current schema ${String(GAME_SCHEMA_VERSION)}`,
  );
  for (const n of notes) console.log(`  ${n}`);
  for (const key of keys) {
    try {
      const { bytes } = await readObject(run.store, key);
      const out = migrateBlob(bytes);
      const state = out.future ? 'future' : out.bytes === null ? 'current' : 'behind';
      const latest = key === latestSave ? ', latest autosave' : '';
      console.log(
        `  ${key}: schema ${String(out.from)} (${state}${latest}, ${String(bytes.byteLength)} bytes)`,
      );
      for (const w of out.warnings) console.log(`      ${w}`);
    } catch (e) {
      console.log(`  ${key}: failed (${errorMessage(e)})`);
    }
  }
}

function loadContentSize(warnings: string[]): ContentSizeModule['computeContentSize'] | null {
  const path = process.env['CONTENT_SIZE_MODULE'] ?? DEFAULT_CONTENT_SIZE_MODULE;
  try {
    return (nodeRequire(path) as ContentSizeModule).computeContentSize;
  } catch (e) {
    warnings.push(
      `content-size module not loaded from ${path}, content_size left as it is (${errorMessage(e)})`,
    );
    return null;
  }
}

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(errorMessage(e));
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  // `Game.entriesOrDefault` stands an unintegrated Y.Map in for the first sheet and map of a
  // document that declares none, and Yjs warns on every read of it: a dozen lines a document that
  // say nothing about the migration. Only that exact message is dropped.
  const warn = console.warn.bind(console);
  console.warn = (...args: unknown[]): void => {
    if (typeof args[0] === 'string' && args[0].startsWith('Invalid access: Add Yjs type')) return;
    warn(...args);
  };

  const { Client } = nodeRequire('pg') as PgModule;
  const sdk = nodeRequire('@aws-sdk/client-s3') as S3Module;
  const db = new Client({ connectionString: env('DATABASE_URL') });
  const store: Store = {
    sdk,
    s3: new sdk.S3Client({
      endpoint: env('S3_ENDPOINT'),
      region: env('S3_REGION'),
      credentials: {
        accessKeyId: env('S3_ACCESS_KEY_ID'),
        secretAccessKey: env('S3_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: true,
    }),
    bucket: env('S3_BUCKET_NAME'),
  };
  const startedAt = new Date().toISOString();
  const report: Report = {
    mode: args.mode === 'check' ? 'dry-run' : args.mode,
    startedAt,
    finishedAt: startedAt,
    bucket: store.bucket,
    schemaVersion: GAME_SCHEMA_VERSION,
    projects: [],
    totals: { projects: 0, contentSizes: 0, migrated: 0, skipped: 0, future: 0, failed: 0 },
    transitions: {},
    warnings: [],
  };
  await db.connect();
  try {
    const run: Run = { args, store, db, computeContentSize: null, report };
    if (args.mode === 'check') {
      await check(run, args.project);
      return;
    }

    run.computeContentSize = loadContentSize(report.warnings);
    const rows = await listProjects(db, args.project);
    if (args.project !== null && rows.length === 0)
      throw new Error(`no project ${String(args.project)}`);
    console.log(`${args.mode}: ${String(rows.length)} project(s) in ${store.bucket}`);
    for (const row of rows) report.projects.push(await processProject(run, row));

    tally(report);
    report.finishedAt = new Date().toISOString();
    const path =
      process.env['MIGRATE_GAMES_REPORT'] ??
      `/tmp/migrate-games.${startedAt.replace(/:/g, '-')}.json`;
    writeFileSync(path, JSON.stringify(report, null, 2));
    printSummary(report, path);
    if (report.totals.failed > 0) process.exitCode = 1;
  } finally {
    await db.end();
    store.s3.destroy();
  }
}

// The spec imports `migrateBlob` from this file; only the bundle, run as a program, has a `module`.
if (typeof module !== 'undefined' && require.main === module) {
  main().catch((e: unknown) => {
    console.error(errorMessage(e));
    process.exitCode = 2;
  });
}
