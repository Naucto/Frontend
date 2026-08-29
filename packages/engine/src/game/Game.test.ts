import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { BUBBLEGUM_16 } from './defaults';
import { Game } from './Game';
import { computeSizeReport } from './size';

describe('Game document', () => {
  it('seeds defaults once and mirrors typed arrays from Yjs', () => {
    const doc = new Y.Doc();
    const game = new Game(doc);
    game.seedDefaults();
    game.seedDefaults();
    expect(game.files).toHaveLength(1);
    expect(game.palette).toEqual([...BUBBLEGUM_16]);
    expect(game.isSpriteEmpty(1)).toBe(false);
    const changes: number[] = [];
    game.onPixelsChange((c) => changes.push(c.length));
    game.transact(() => {
      game.setPixel(100, 100, 3);
      game.setPixel(101, 100, 0);
    });
    expect(changes).toEqual([1]);
    expect(game.sheet[100 * 128 + 100]).toBe(3);
    // a remote doc sees the same state
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    expect(new Game(remote).getPixel(100, 100)).toBe(3);
  });

  it('manages nameable code tabs with a stable entry', () => {
    const game = new Game(new Y.Doc());
    game.seedDefaults();
    const util = game.addFile('util.lua', 'return 1');
    game.renameFile(util.id, 'helpers.lua');
    expect(game.files.map((f) => f.name)).toEqual(['main.lua', 'helpers.lua']);
    expect(game.entryFile?.name).toBe('main.lua');
    const src = game.sources();
    expect([...src.modules.keys()]).toEqual(['helpers']);
    game.removeFile(util.id);
    expect(game.files).toHaveLength(1);
    game.removeFile(game.files[0]?.id ?? '');
    expect(game.files).toHaveLength(1);
  });

  it('converges on one main.lua when two clients seed the same empty document', () => {
    // What the editor actually does: a local doc seeds before the server's history arrives, and
    // both halves then merge. With a random id per client the merge kept both files.
    const a = new Y.Doc();
    const b = new Y.Doc();
    new Game(a).seedDefaults();
    new Game(b).seedDefaults();
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    const merged = new Game(a);
    expect(merged.files.map((f) => f.name)).toEqual(['main.lua']);
    expect(merged.entryFile?.name).toBe('main.lua');
    expect(merged.sources().entry.length).toBeGreaterThan(0);
    expect(new Game(b).files).toHaveLength(1);
  });

  it('repairs a document that was already seeded twice', () => {
    const game = new Game(new Y.Doc());
    game.seedDefaults();
    const source = game.entryFile?.text.toString() ?? '';
    // Two strays: one empty, one an exact copy. Both are safe to drop.
    game.addFile('main.lua', '');
    game.addFile('main.lua', source);
    // And one that diverged, which must survive under a different name rather than be tidied away.
    const diverged = game.addFile('main.lua', 'print("mine")');
    expect(game.files.filter((f) => f.name === 'main.lua')).toHaveLength(4);

    game.seedDefaults();

    expect(game.files.filter((f) => f.name === 'main.lua')).toHaveLength(1);
    expect(game.entryFile?.text.toString()).toBe(source);
    expect(game.files.find((f) => f.id === diverged.id)?.name).toMatch(/^main\.recovered-/);
  });

  describe('restoreFrom', () => {
    /**
     * The editor restored versions with `Y.applyUpdate` for its whole life. A version blob is
     * `encodeStateAsUpdate` of the same document at an earlier moment, so every operation in it is
     * already applied — feeding it back does nothing at all. These pin the difference.
     */
    const snapshotOf = (doc: Y.Doc): Uint8Array => Y.encodeStateAsUpdate(doc);

    it('puts back content that a later edit changed, which applyUpdate cannot', () => {
      const doc = new Y.Doc();
      const game = new Game(doc);
      game.seedDefaults();
      const entry = game.entryFile!;
      const original = entry.text.toString();
      const snapshot = snapshotOf(doc);

      entry.text.insert(0, '-- a line nobody wanted\n');
      game.setPixel(3, 4, 7);
      doc.getText('projectName').insert(0, 'Renamed');

      Y.applyUpdate(doc, snapshot);
      expect(entry.text.toString()).not.toBe(original); // the bug, stated

      game.restoreFrom(snapshot);

      expect(game.entryFile?.text.toString()).toBe(original);
      expect(game.getPixel(3, 4)).toBe(0);
      expect(doc.getText('projectName').toString()).toBe('');
    });

    it('drops what was added after the snapshot and brings back what was deleted', () => {
      const doc = new Y.Doc();
      const game = new Game(doc);
      game.seedDefaults();
      const kept = game.addFile('helper.lua', 'return 1');
      const snapshot = snapshotOf(doc);

      game.addFile('scratch.lua', 'oops');
      game.removeFile(kept.id);

      game.restoreFrom(snapshot);

      const names = game.files.map((f) => f.name).sort();
      expect(names).toEqual(['helper.lua', 'main.lua']);
      expect(game.files.find((f) => f.name === 'helper.lua')?.text.toString()).toBe('return 1');
    });

    it('restores as edits, so everyone else in the session sees the same document', () => {
      const doc = new Y.Doc();
      const game = new Game(doc);
      game.seedDefaults();
      const snapshot = snapshotOf(doc);

      const peer = new Y.Doc();
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
      game.setPixel(100, 100, 9);
      game.entryFile!.text.insert(0, 'x');
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));

      game.restoreFrom(snapshot);
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));

      const remote = new Game(peer);
      expect(remote.getPixel(100, 100)).toBe(0);
      expect(game.getPixel(100, 100)).toBe(0);
      expect(remote.entryFile?.text.toString()).toBe(game.entryFile?.text.toString());
    });

    it('leaves a document that already matches the snapshot untouched', () => {
      const doc = new Y.Doc();
      const game = new Game(doc);
      game.seedDefaults();
      const before = Y.encodeStateVector(doc);

      game.restoreFrom(Y.encodeStateAsUpdate(doc));

      expect(Y.encodeStateVector(doc)).toEqual(before);
    });
  });

  it('reports effective sizes', () => {
    const game = new Game(new Y.Doc());
    game.seedDefaults();
    const r = computeSizeReport(game);
    expect(r.code).toBeGreaterThan(100);
    expect(r.sprites).toBeGreaterThan(50);
    // The four categories the editor draws must add up to the total it shows beside them.
    expect(r.total).toBe(r.code + r.sprites + r.map + r.sound);
    expect(r.encoded).toBeGreaterThan(0);
  });
});
