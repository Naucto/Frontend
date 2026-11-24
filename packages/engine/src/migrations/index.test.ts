import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { EditableGame } from '../game/EditableGame';
import { Game } from '../game/Game';
import { GAME_SCHEMA_VERSION, KEYS, LEGACY_KEYS } from '../game/keys';
import { migrateGame, needsMigration, schemaVersionOf } from './index';

/** A document marked at a schema, without the actions only the current one gives a new game. */
function docAt(version: number, code: string): Y.Doc {
  const doc = new Y.Doc();
  const game = new EditableGame(doc);
  game.seedDefaults();
  doc.getMap(KEYS.meta).set('schemaVersion', version);
  if (version < GAME_SCHEMA_VERSION) {
    doc.getMap(KEYS.actions).clear();
  }
  const main = game.files[0];
  main?.text.delete(0, main.text.length);
  main?.text.insert(0, code);
  game.destroy();

  return doc;
}

const v1Doc = (code: string): Y.Doc => docAt(1, code);

/** The labels of the actions a game holds, for those that are not the label a game gets unasked. */
const authoredLabels = (doc: Y.Doc): [string, string][] =>
  new Game(doc).actions
    .filter((action) => action.label.toLowerCase() !== action.name)
    .map((action) => [action.name, action.label]);

describe('migrateGame across steps', () => {
  it('brings a v0 document to the current schema through every step', () => {
    const doc = new Y.Doc();
    doc
      .getText(LEGACY_KEYS.code)
      .insert(0, 'function _update()\n  if key_pressed("ArrowLeft") then x = x - 1 end\nend\n');
    expect(schemaVersionOf(doc)).toBe(0);

    const report = migrateGame(doc);

    expect(report).toMatchObject({ from: 0, to: 3, applied: true });
    const game = new EditableGame(doc);
    expect(game.schemaVersion).toBe(3);
    expect(game.files[0]?.text.toString()).toContain('input.key_pressed("ArrowLeft")');
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
  });

  it('opens a v1 game that reads input.btn as a game that reads input.held, its labels on its actions', () => {
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

    expect(report).toMatchObject({ from: 1, to: 3, applied: true });
    expect(report.warnings).toEqual([]);
    const game = new EditableGame(doc);
    expect(game.schemaVersion).toBe(3);
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
    expect(authoredLabels(doc)).toEqual([
      ['left', 'Port'],
      ['a', 'Fire'],
    ]);
    expect(doc.getMap(KEYS.meta).has('actions')).toBe(false);
  });

  it('merges the labels of several files over the ones the document already holds, in action order', () => {
    const doc = v1Doc('input.declare{ pause = "Menu", a = "Jump" }');
    doc.getMap(KEYS.meta).set('actions', [
      { action: 'a', label: 'Old' },
      { action: 'x', label: 'Shoot' },
    ]);
    const second = new EditableGame(doc).addFile('helpers');
    second?.text.insert(0, 'input.declare{ a = "Fire" }');

    migrateGame(doc);

    expect(authoredLabels(doc)).toEqual([
      ['a', 'Fire'],
      ['x', 'Shoot'],
      ['pause', 'Menu'],
    ]);
  });

  it('leaves the labels the document holds when no file declares any', () => {
    const doc = v1Doc('print("nothing to declare")');
    doc.getMap(KEYS.meta).set('actions', [{ action: 'b', label: 'Dash' }]);

    migrateGame(doc);

    expect(authoredLabels(doc)).toEqual([['b', 'Dash']]);
  });
});

describe('migrateGame renames past the schema', () => {
  it('brings a current game to the current names without moving its version', () => {
    const doc = docAt(3, 'local p, s = sound.music_position()\nif input.btn("a") then end');
    expect(needsMigration(doc)).toBe(true);

    const report = migrateGame(doc);

    expect(report).toMatchObject({ from: 3, to: 3, applied: true, counts: { 'rewrites:main': 2 } });
    const game = new EditableGame(doc);
    expect(game.schemaVersion).toBe(3);
    expect(doc.getMap(KEYS.meta).has('migratedFrom')).toBe(false);
    expect(game.files[0]?.text.toString()).toBe(
      'local p, s = sound.music_pos()\nif input.held("a") then end',
    );
    expect(needsMigration(doc)).toBe(false);
  });

  it('gives a v1 game the sound rename along with the input ones', () => {
    const doc = v1Doc('if input.btnp("a") then local p, s = sound.music_position() end');

    const report = migrateGame(doc);

    expect(report).toMatchObject({ from: 1, to: 3, applied: true });
    expect(new EditableGame(doc).files[0]?.text.toString()).toBe(
      'if input.pressed("a") then local p, s = sound.music_pos() end',
    );
  });

  it('leaves a current game with nothing to rename untouched', () => {
    const doc = docAt(3, 'local p, s = sound.music_pos()\n-- sound.music_position() was its name');
    const updates: unknown[] = [];
    doc.on('update', (update: unknown) => updates.push(update));

    expect(needsMigration(doc)).toBe(false);
    const report = migrateGame(doc);

    expect(report).toMatchObject({ from: 3, to: 3, applied: false, counts: {} });
    expect(updates).toEqual([]);
  });
});

describe('reading and migrating a document', () => {
  it('leaves nothing watching the document once done', () => {
    const doc = v1Doc('if input.btnp("a") then end');
    needsMigration(doc);
    migrateGame(doc);
    needsMigration(doc);
    const watching = vi.spyOn(
      Game.prototype as unknown as { attachSheetObservers: () => void },
      'attachSheetObservers',
    );

    doc.getMap<Y.Map<unknown>>(KEYS.sheets).set('x', new Y.Map());

    expect(watching).not.toHaveBeenCalled();
    watching.mockRestore();
  });
});
