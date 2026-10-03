import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { blankGame } from './blank-game';
import { BUBBLEGUM_16 } from './defaults';
import { EditableGame, RESTORE_KINDS } from './EditableGame';
import { KEYS } from './keys';
import { computeSizeReport } from './size';

describe('Game document', () => {
  it('seeds defaults once and mirrors typed arrays from Yjs', () => {
    const doc = new Y.Doc();
    const game = new EditableGame(doc);
    game.seedDefaults();
    game.seedDefaults();
    expect(game.files).toHaveLength(1);
    expect(game.palette).toEqual([...BUBBLEGUM_16]);
    expect(game.isSpriteEmpty(1)).toBe(false);
    const changes: number[] = [];
    game.onPixelsChange((pixels) => changes.push(pixels.length));
    game.transact(() => {
      game.sheets[0]?.setPixel(100, 100, 3);
      game.sheets[0]?.setPixel(101, 100, 0);
    });
    expect(changes).toEqual([1]);
    expect(game.sheets[0]?.pixels[100 * 128 + 100]).toBe(3);
    // a remote doc sees the same state
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    expect(new EditableGame(remote).sheets[0]?.getPixel(100, 100)).toBe(3);
  });

  it('manages nameable code tabs with a stable entry', () => {
    const game = blankGame();
    game.seedDefaults();
    const util = game.addFile('util', 'return 1');
    game.renameFile(util.id, 'helpers');
    expect(game.files.map((file) => file.name)).toEqual(['main', 'helpers']);
    expect(game.entryFile?.name).toBe('main');
    expect(game.sources().map((file) => file.name)).toEqual(['main', 'helpers']);
    game.removeFile(util.id);
    expect(game.files).toHaveLength(1);
    game.removeFile(game.files[0]?.id ?? '');
    expect(game.files).toHaveLength(1);
  });

  it('converges on one entry when two clients seed the same empty document', () => {
    // A local doc seeds before the server's history arrives, then both halves merge.
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    new EditableGame(docA).seedDefaults();
    new EditableGame(docB).seedDefaults();
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    const merged = new EditableGame(docA);
    expect(merged.files.map((file) => file.name)).toEqual(['main']);
    expect(merged.entryFile?.name).toBe('main');
    expect(merged.sources()[0]?.source.length).toBeGreaterThan(0);
    expect(new EditableGame(docB).files).toHaveLength(1);
  });

  it('repairs a document that was already seeded twice', () => {
    const game = blankGame();
    game.seedDefaults();
    const source = game.entryFile?.text.toString() ?? '';
    // Two strays: one empty, one an exact copy. Both are safe to drop.
    game.addFile('main', '');
    game.addFile('main', source);
    // And one that diverged, which must survive under a different name rather than be tidied away.
    const diverged = game.addFile('main', 'print("mine")');
    expect(game.files.filter((file) => file.name === 'main')).toHaveLength(4);

    game.seedDefaults();

    expect(game.files.filter((file) => file.name === 'main')).toHaveLength(1);
    expect(game.entryFile?.text.toString()).toBe(source);
    expect(game.files.find((file) => file.id === diverged.id)?.name).toMatch(/^main recovered /);
  });

  describe('restoreFrom', () => {
    /**
     * A version blob is this document's own past, so `Y.applyUpdate` of it is a no-op; these pin
     * that restoreFrom is not.
     */
    const snapshotOf = (doc: Y.Doc): Uint8Array => Y.encodeStateAsUpdate(doc);

    it('puts back content that a later edit changed, which applyUpdate cannot', () => {
      const doc = new Y.Doc();
      const game = new EditableGame(doc);
      game.seedDefaults();
      const entry = game.entryFile!;
      const original = entry.text.toString();
      const snapshot = snapshotOf(doc);

      entry.text.insert(0, '-- a line nobody wanted\n');
      game.sheets[0]?.setPixel(3, 4, 7);
      doc.getText('projectName').insert(0, 'Renamed');

      Y.applyUpdate(doc, snapshot);
      expect(entry.text.toString()).not.toBe(original);

      game.restoreFrom(snapshot);

      expect(game.entryFile?.text.toString()).toBe(original);
      expect(game.sheets[0]?.getPixel(3, 4)).toBe(0);
      expect(doc.getText('projectName').toString()).toBe('');
    });

    it('drops what was added after the snapshot and brings back what was deleted', () => {
      const doc = new Y.Doc();
      const game = new EditableGame(doc);
      game.seedDefaults();
      const kept = game.addFile('helper', 'return 1');
      const snapshot = snapshotOf(doc);

      game.addFile('scratch', 'oops');
      game.removeFile(kept.id);

      game.restoreFrom(snapshot);

      const names = game.files.map((file) => file.name).sort();
      expect(names).toEqual(['helper', 'main']);
      expect(game.files.find((file) => file.name === 'helper')?.text.toString()).toBe('return 1');
    });

    it('restores as edits, so everyone else in the session sees the same document', () => {
      const doc = new Y.Doc();
      const game = new EditableGame(doc);
      game.seedDefaults();
      const snapshot = snapshotOf(doc);

      const peer = new Y.Doc();
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
      game.sheets[0]?.setPixel(100, 100, 9);
      game.entryFile!.text.insert(0, 'x');
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));

      game.restoreFrom(snapshot);
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));

      const remote = new EditableGame(peer);
      expect(remote.sheets[0]?.getPixel(100, 100)).toBe(0);
      expect(game.sheets[0]?.getPixel(100, 100)).toBe(0);
      expect(remote.entryFile?.text.toString()).toBe(game.entryFile?.text.toString());
    });

    it('restores every root the document keys', () => {
      expect(Object.keys(RESTORE_KINDS).sort()).toEqual(Object.keys(KEYS).sort());
    });

    it('leaves a document that already matches the snapshot untouched', () => {
      const doc = new Y.Doc();
      const game = new EditableGame(doc);
      game.seedDefaults();
      const before = Y.encodeStateVector(doc);

      game.restoreFrom(Y.encodeStateAsUpdate(doc));

      expect(Y.encodeStateVector(doc)).toEqual(before);
    });
  });

  it('reports effective sizes', () => {
    const game = blankGame();
    game.seedDefaults();
    const report = computeSizeReport(game);
    expect(report.code).toBeGreaterThan(100);
    expect(report.sprites).toBeGreaterThan(50);
    // The four categories the editor draws must add up to the total it shows beside them.
    expect(report.total).toBe(report.code + report.sprites + report.map + report.sound);
    expect(report.encoded).toBeGreaterThan(0);
  });
});
