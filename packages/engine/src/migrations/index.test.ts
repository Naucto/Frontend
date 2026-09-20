import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { Game } from '../game/Game';
import { KEYS, LEGACY_KEYS } from '../game/keys';
import { migrateGame, needsMigration, schemaVersionOf } from './index';

function docAt(version: number, code: string): Y.Doc {
  const doc = new Y.Doc();
  const game = new Game(doc);
  game.seedDefaults();
  doc.getMap(KEYS.meta).set('schemaVersion', version);
  const main = game.files[0];
  main?.text.delete(0, main.text.length);
  main?.text.insert(0, code);

  return doc;
}

const v1Doc = (code: string): Y.Doc => docAt(1, code);

describe('migrateGame across steps', () => {
  it('brings a v0 document to v2 through both steps', () => {
    const doc = new Y.Doc();
    doc
      .getText(LEGACY_KEYS.code)
      .insert(0, 'function _update()\n  if key_pressed("ArrowLeft") then x = x - 1 end\nend\n');
    expect(schemaVersionOf(doc)).toBe(0);

    const report = migrateGame(doc);

    expect(report).toMatchObject({ from: 0, to: 2, applied: true });
    const game = new Game(doc);
    expect(game.schemaVersion).toBe(2);
    expect(game.compat).toBe(true);
    expect(game.files[0]?.text.toString()).toContain('input.key_pressed("ArrowLeft")');
  });

  it('opens a v1 game that reads input.btn as a v2 game that reads input.held', () => {
    const doc = v1Doc(
      [
        'function _init()',
        '  input.declare{ left = "Port", a = "Fire" }',
        'end',
        'function _update()',
        '  if input.btn("left") then x = x - 1 end',
        '  if input.btnp("a") then fire() end',
        'end',
      ].join('\n'),
    );

    const report = migrateGame(doc);

    expect(report).toMatchObject({ from: 1, to: 2, applied: true });
    expect(report.warnings).toEqual([]);
    const game = new Game(doc);
    expect(game.schemaVersion).toBe(2);
    expect(game.compat).toBe(false);
    expect(game.files[0]?.text.toString()).toBe(
      [
        'function _init()',
        'end',
        'function _update()',
        '  if input.held("left") then x = x - 1 end',
        '  if input.pressed("a") then fire() end',
        'end',
      ].join('\n'),
    );
    expect(game.declaredActions).toEqual([
      { action: 'left', label: 'Port' },
      { action: 'a', label: 'Fire' },
    ]);
  });

  it('merges the labels of several files over the ones the document already holds, in action order', () => {
    const doc = v1Doc('input.declare{ pause = "Menu", a = "Jump" }');
    const game = new Game(doc);
    game.setDeclaredActions([
      { action: 'a', label: 'Old' },
      { action: 'x', label: 'Shoot' },
    ]);
    const second = game.addFile('helpers');
    second.text.insert(0, 'input.declare{ a = "Fire" }');

    migrateGame(doc);

    expect(new Game(doc).declaredActions).toEqual([
      { action: 'a', label: 'Fire' },
      { action: 'x', label: 'Shoot' },
      { action: 'pause', label: 'Menu' },
    ]);
  });

  it('leaves the labels the document holds when no file declares any', () => {
    const doc = v1Doc('print("nothing to declare")');
    new Game(doc).setDeclaredActions([{ action: 'b', label: 'Dash' }]);

    migrateGame(doc);

    expect(new Game(doc).declaredActions).toEqual([{ action: 'b', label: 'Dash' }]);
  });
});

describe('migrateGame renames past the schema', () => {
  it('brings a current game to the current names without moving its version', () => {
    const doc = docAt(2, 'local p, s = sound.music_position()\nif input.btn("a") then end');
    expect(needsMigration(doc)).toBe(true);

    const report = migrateGame(doc);

    expect(report).toMatchObject({ from: 2, to: 2, applied: true, counts: { 'rewrites:main': 2 } });
    const game = new Game(doc);
    expect(game.schemaVersion).toBe(2);
    expect(doc.getMap(KEYS.meta).has('migratedFrom')).toBe(false);
    expect(game.files[0]?.text.toString()).toBe(
      'local p, s = sound.music_pos()\nif input.held("a") then end',
    );
    expect(needsMigration(doc)).toBe(false);
  });

  it('gives a v1 game the sound rename along with the input ones', () => {
    const doc = v1Doc('if input.btnp("a") then local p, s = sound.music_position() end');

    const report = migrateGame(doc);

    expect(report).toMatchObject({ from: 1, to: 2, applied: true });
    expect(new Game(doc).files[0]?.text.toString()).toBe(
      'if input.pressed("a") then local p, s = sound.music_pos() end',
    );
  });

  it('leaves a current game with nothing to rename untouched', () => {
    const doc = docAt(2, 'local p, s = sound.music_pos()\n-- sound.music_position() was its name');
    const updates: unknown[] = [];
    doc.on('update', (u: unknown) => updates.push(u));

    expect(needsMigration(doc)).toBe(false);
    const report = migrateGame(doc);

    expect(report).toMatchObject({ from: 2, to: 2, applied: false, counts: {} });
    expect(updates).toEqual([]);
  });
});
