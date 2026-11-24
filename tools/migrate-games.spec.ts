import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { EditableGame } from '../packages/engine/src/game/EditableGame';
import { Game } from '../packages/engine/src/game/Game';
import { GAME_SCHEMA_VERSION, KEYS } from '../packages/engine/src/game/keys';
import { migrateBlob, parseArgs } from './migrate-games';

const V1_CODE = [
  'function _update()',
  '  if input.btn("a") then local p, s = sound.music_position() end',
  'end',
].join('\n');

function blobAt(version: number, code: string): Uint8Array {
  const doc = new Y.Doc();
  const game = new EditableGame(doc);
  game.seedDefaults();
  doc.getMap(KEYS.meta).set('schemaVersion', version);
  const main = game.files[0];
  main.text.delete(0, main.text.length);
  main.text.insert(0, code);
  return Y.encodeStateAsUpdate(doc);
}

function decode(bytes: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, bytes);
  return doc;
}

describe('migrateBlob', () => {
  it('brings a v1 blob to the current schema and renames the calls its code makes', () => {
    const out = migrateBlob(blobAt(1, V1_CODE));

    expect(out.future).toBe(false);
    expect(out.from).toBe(1);
    expect(out.to).toBe(GAME_SCHEMA_VERSION);
    const doc = decode(out.bytes!);
    expect(doc.getMap(KEYS.meta).get('schemaVersion')).toBe(GAME_SCHEMA_VERSION);
    const code = new Game(doc).files[0].text.toString();
    expect(code).toContain('input.held(');
    expect(code).toContain('sound.music_pos(');
    expect(code).not.toContain('input.btn(');
    expect(code).not.toContain('sound.music_position(');
  });

  it('leaves a current document exactly as it is', () => {
    expect(migrateBlob(blobAt(GAME_SCHEMA_VERSION, 'function _update() end'))).toEqual({
      bytes: null,
      from: GAME_SCHEMA_VERSION,
      to: GAME_SCHEMA_VERSION,
      warnings: [],
      future: false,
    });
  });

  it('brings a v2 blob to the current schema with the nine actions and the names it gave them', () => {
    const doc = decode(blobAt(2, 'function _update()\n  if input.held("a") then end\nend'));
    doc.getMap(KEYS.actions).clear();
    doc.getMap(KEYS.meta).set('actions', [{ action: 'a', label: 'Jump' }]);

    const out = migrateBlob(Y.encodeStateAsUpdate(doc));

    expect(out).toMatchObject({ from: 2, to: GAME_SCHEMA_VERSION, future: false, warnings: [] });
    const migrated = decode(out.bytes!);
    expect(migrated.getMap(KEYS.meta).get('schemaVersion')).toBe(GAME_SCHEMA_VERSION);
    expect(migrated.getMap(KEYS.meta).has('actions')).toBe(false);
    const game = new Game(migrated);
    expect(game.actions.map((action) => action.name)).toEqual([
      'left',
      'right',
      'up',
      'down',
      'a',
      'b',
      'x',
      'y',
      'pause',
    ]);
    expect(game.actions[4]).toMatchObject({ name: 'a', label: 'Jump' });
    expect(game.actions[4]?.inputs).toContainEqual({ kind: 'key', player: 0, key: 'x' });
    expect(game.files[0].text.toString()).toContain('input.held("a")');
    expect(migrateBlob(out.bytes!).bytes).toBeNull();
  });

  it('brings a v2 blob still holding the first sheet in the roots to the collection shape', () => {
    const doc = new Y.Doc();
    doc.getMap(KEYS.meta).set('schemaVersion', 2);
    doc.getMap(KEYS.meta).set('sheetWidth', 64);
    doc.getMap<number>('gfx.sprites').set('3,4', 9);

    const out = migrateBlob(Y.encodeStateAsUpdate(doc));

    expect(out).toMatchObject({ from: 2, to: GAME_SCHEMA_VERSION });
    const game = new Game(decode(out.bytes!));
    expect(game.sheets[0]?.getPixel(3, 4)).toBe(9);
    expect(game.sheets[0]?.width).toBe(64);
    expect(game.actions).toHaveLength(9);
    expect(migrateBlob(out.bytes!).bytes).toBeNull();
  });

  it('refuses a document from a future schema', () => {
    const out = migrateBlob(blobAt(99, 'function _update() end'));

    expect(out.future).toBe(true);
    expect(out.bytes).toBeNull();
    expect(out.from).toBe(99);
  });

  it('changes nothing the second time', () => {
    const once = migrateBlob(blobAt(1, V1_CODE));
    const twice = migrateBlob(once.bytes!);

    expect(twice.bytes).toBeNull();
    expect(twice.future).toBe(false);
    expect(twice.from).toBe(GAME_SCHEMA_VERSION);
  });

  it('reads an empty blob as an empty game at the current schema', () => {
    const out = migrateBlob(new Uint8Array(0));

    expect(out.bytes).toBeNull();
    expect(out.from).toBe(GAME_SCHEMA_VERSION);
  });
});

describe('parseArgs', () => {
  const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

  it('takes one project by its id, a UUID, as the database and the object keys spell it', () => {
    expect(parseArgs(['--dry-run', '--project', ID])).toEqual({ mode: 'dry-run', project: ID });
    expect(parseArgs(['--apply', '--project', ID.toUpperCase()])).toEqual({
      mode: 'apply',
      project: ID,
    });
    expect(parseArgs(['--check', ID])).toEqual({ mode: 'check', project: ID });
  });

  it('runs over every project when none is named', () => {
    expect(parseArgs(['--apply'])).toEqual({ mode: 'apply', project: null });
  });

  it.each([['--project', '41'], ['--check', '41'], ['--project', `${ID}0`], ['--project']])(
    'refuses %s %s: a project is named by a UUID and nothing else',
    (...argv) => {
      expect(() => parseArgs(['--dry-run', ...argv.filter(Boolean)])).toThrow(/needs a project id/);
    },
  );
});
