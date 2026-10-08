export class MissingEnvVarError extends Error {
  constructor(varName: string) {
    super(`${varName} environment variable is not set`);
    this.name = this.constructor.name;
  }
}

export class BadEnvVarError extends Error {
  constructor(varName: string) {
    super(`${varName} environment variable has an invalid value`);
    this.name = this.constructor.name;
  }
}

type Parser<T> = (raw: string, key: string) => T;

const text: Parser<string> = (raw) => raw;

const flag: Parser<boolean> = (raw, key) => {
  switch (raw.trim().toLowerCase()) {
    case 'true':
    case '1':
      return true;
    case 'false':
    case '0':
      return false;
    default:
      throw new BadEnvVarError(key);
  }
};

/**
 * Every variable the Node-side tooling reads (Playwright, e2e, tools/), with the type it is read
 * as. The browser app has no environment: it reads the runtime config.json.
 */
const ENV = {
  CI: flag,
  E2E_BASE_URL: text,

  NAUCTO_API: text,
  NAUCTO_SEED_PASSWORD: text,

  DATABASE_URL: text,
  S3_ENDPOINT: text,
  S3_REGION: text,
  S3_ACCESS_KEY_ID: text,
  S3_SECRET_ACCESS_KEY: text,
  S3_BUCKET_NAME: text,
  CONTENT_SIZE_MODULE: text,
  MIGRATE_GAMES_REPORT: text,
} satisfies Record<string, Parser<unknown>>;

export type EnvKey = keyof typeof ENV;
export type EnvValue<K extends EnvKey> = ReturnType<(typeof ENV)[K]>;

/** An empty variable counts as unset: compose and CI pass `KEY=` through as "". */
function readRaw(key: EnvKey): string | undefined {
  const raw = process.env[key];
  return raw === undefined || raw === '' ? undefined : raw;
}

/** Throws MissingEnvVarError when unset, BadEnvVarError when the value does not parse. */
export function getEnv<K extends EnvKey>(key: K): EnvValue<K> {
  const raw = readRaw(key);
  if (raw === undefined) {
    throw new MissingEnvVarError(key);
  }
  return ENV[key](raw, key) as EnvValue<K>;
}

/** The fallback when unset; a value that does not parse still throws BadEnvVarError. */
export function getOptionalEnv<K extends EnvKey>(key: K, fallback: EnvValue<K>): EnvValue<K>;
export function getOptionalEnv<K extends EnvKey>(key: K): EnvValue<K> | undefined;
export function getOptionalEnv<K extends EnvKey>(
  key: K,
  fallback?: EnvValue<K>,
): EnvValue<K> | undefined {
  const raw = readRaw(key);
  if (raw === undefined) {
    return fallback;
  }
  return ENV[key](raw, key) as EnvValue<K>;
}
