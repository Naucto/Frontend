/**
 * Builds the web app with its release compiled in: the version of `apps/web`, and the commit it
 * was built from. Git answers outside a container, and `GIT_COMMIT` inside one, where the image
 * holds no `.git`. Run from the repository root. Arguments after the script go to `ng build`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { getOptionalEnv } from './env';

const root = process.cwd();

function commit(): string | undefined {
  const given = getOptionalEnv('GIT_COMMIT');
  if (given) {
    return given.slice(0, 12);
  }
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch {
    return undefined;
  }
}

const { version } = JSON.parse(readFileSync(join(root, 'apps/web/package.json'), 'utf8')) as {
  version: string;
};
const hash = commit();
const release = hash ? `${version}+${hash}` : version;

const ng = createRequire(join(root, 'package.json')).resolve('@angular/cli/bin/ng.js');
const result = spawnSync(
  process.execPath,
  [
    ng,
    'build',
    'web',
    '--define',
    `NC_RELEASE=${JSON.stringify(release)}`,
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);
console.log(`release ${release}`);
process.exit(result.status ?? 1);
