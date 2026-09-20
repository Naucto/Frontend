import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { Game } from '../packages/engine/src/game/Game';
import { GAME_SCHEMA_VERSION, KEYS } from '../packages/engine/src/game/keys';
import { migrateBlob } from './migrate-games';

const V1_CODE = [
  'function _update()',
  '  if input.btn("a") then local p, s = sound.music_position() end',
  'end',
].join('\n');

function blobAt(version: number, code: string): Uint8Array {
  const doc = new Y.Doc();
  const game = new Game(doc);
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
    expect(doc.getMap(KEYS.meta).get('schemaVersion')).toBe(2);
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
