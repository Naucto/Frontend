import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { defaultInstrument, defaultPattern, defaultSong } from '../sound/model';
import { EditableGame } from './EditableGame';
import { FIRST_MAP_ID, FIRST_SHEET_ID, MAIN_FILE_ID } from './keys';

/** A key the classic preset plugs into nothing. */
const TAB = { kind: 'key', player: 0, key: 'Tab' } as const;

/** A game that holds something for every mutator to change, and the switch on its gate. */
function seeded(): { game: EditableGame; doc: Y.Doc; close: () => void } {
  let open = true;
  const doc = new Y.Doc();
  const game = new EditableGame(doc, () => open);
  game.seedDefaults();
  game.addSheet('tiles', 64, 64, 'sheet-2');
  game.addMap('cave', 16, 16, 'map-2');
  game.addFile('helpers', 'return 1', 'file-2');
  game.plugInput('pause', TAB);
  game.setNetPermission('players.score', 1);
  game.sheets[0]?.setFlag(1, 0b1);
  game.maps[0]?.setTile(2, 2, 1);

  return {
    game,
    doc,
    close: () => {
      open = false;
    },
  };
}

function empty(): { game: EditableGame; doc: Y.Doc; close: () => void } {
  let open = true;
  const doc = new Y.Doc();

  return {
    game: new EditableGame(doc, () => open),
    doc,
    close: () => {
      open = false;
    },
  };
}

/** Another game's saved state, differing from a seeded one in its code. */
function otherSnapshot(): Uint8Array {
  const doc = new Y.Doc();
  const game = new EditableGame(doc);
  game.seedDefaults();
  game.addFile('elsewhere', 'return 2');

  return Y.encodeStateAsUpdate(doc);
}

interface Mutation {
  /** The document it is run on: one that holds a starter game and more, or nothing at all. */
  on: typeof seeded;
  /** A call that changes that document when the game may be written. */
  run(game: EditableGame): void;
}

/**
 * Every public method of {@link EditableGame} that writes, with a call that does. A method added
 * to the class has to be given a line here, in {@link READS} or in {@link INTERNAL}, or the
 * comparison against the class below fails.
 */
const MUTATORS: Record<string, Mutation> = {
  transact: {
    on: seeded,
    run: (game) => {
      game.transact(() => {
        game.meta.set('touched', true);
      });
    },
  },
  addSheet: {
    on: seeded,
    run: (game) => {
      game.addSheet('more', 32, 32);
    },
  },
  resizeSheet: {
    on: seeded,
    run: (game) => {
      game.resizeSheet(FIRST_SHEET_ID, 64, 64);
    },
  },
  resizeMap: {
    on: seeded,
    run: (game) => {
      game.resizeMap(FIRST_MAP_ID, 8, 8);
    },
  },
  describeSheet: {
    on: seeded,
    run: (game) => {
      game.describeSheet(FIRST_SHEET_ID, 'hero', 3);
    },
  },
  describeMap: {
    on: seeded,
    run: (game) => {
      game.describeMap(FIRST_MAP_ID, 'town', 3);
    },
  },
  removeSheet: {
    on: seeded,
    run: (game) => {
      game.removeSheet('sheet-2');
    },
  },
  addMap: {
    on: seeded,
    run: (game) => {
      game.addMap('more', 8, 8);
    },
  },
  removeMap: {
    on: seeded,
    run: (game) => {
      game.removeMap('map-2');
    },
  },
  addAction: { on: seeded, run: (game) => game.addAction({ name: 'dash' }) },
  updateAction: { on: seeded, run: (game) => game.updateAction('pause', { label: 'Menu' }) },
  removeAction: {
    on: seeded,
    run: (game) => {
      game.removeAction('pause');
    },
  },
  reorderActions: {
    on: seeded,
    run: (game) => {
      game.reorderActions(['pause', 'left']);
    },
  },
  plugInput: {
    on: seeded,
    run: (game) => {
      game.plugInput('left', { kind: 'pad', control: 'a' });
    },
  },
  unplugInput: {
    on: seeded,
    run: (game) => {
      game.unplugInput('pause', TAB);
    },
  },
  applyPreset: {
    on: seeded,
    run: (game) => {
      game.applyPreset('platformer');
    },
  },
  setPaletteColour: {
    on: seeded,
    run: (game) => {
      game.setPaletteColour(3, '#123456');
    },
  },
  setPalette: {
    on: seeded,
    run: (game) => {
      game.setPalette(['#000000', '#ffffff']);
    },
  },
  addFile: { on: seeded, run: (game) => game.addFile('extra', 'return 3') },
  renameFile: {
    on: seeded,
    run: (game) => {
      game.renameFile('file-2', 'tools');
    },
  },
  reorderFiles: {
    on: seeded,
    run: (game) => {
      game.reorderFiles(['file-2', MAIN_FILE_ID]);
    },
  },
  setFileColour: {
    on: seeded,
    run: (game) => {
      game.setFileColour('file-2', 5);
    },
  },
  removeFile: {
    on: seeded,
    run: (game) => {
      game.removeFile('file-2');
    },
  },
  setInstrument: {
    on: seeded,
    run: (game) => {
      game.setInstrument(defaultInstrument('lead'));
    },
  },
  setPattern: {
    on: seeded,
    run: (game) => {
      game.setPattern(defaultPattern('p0'));
    },
  },
  setSong: {
    on: seeded,
    run: (game) => {
      game.setSong(0, defaultSong());
    },
  },
  setNetPermission: {
    on: seeded,
    run: (game) => {
      game.setNetPermission('players.score', 3);
    },
  },
  moveNetPermissions: {
    on: seeded,
    run: (game) => {
      game.moveNetPermissions('players', 'people');
    },
  },
  removeNetPermissions: {
    on: seeded,
    run: (game) => {
      game.removeNetPermissions('players');
    },
  },
  restoreFrom: {
    on: seeded,
    run: (game) => {
      game.restoreFrom(otherSnapshot());
    },
  },
  seedDefaultSprite: {
    on: seeded,
    run: (game) => {
      game.seedDefaultSprite(9);
    },
  },
  seedSheetAndMap: {
    on: empty,
    run: (game) => {
      game.seedSheetAndMap();
    },
  },
  seedDefaults: {
    on: empty,
    run: (game) => {
      game.seedDefaults();
    },
  },
};

/** What a sheet and a map of the game write for it: the same gate, reached through a projection. */
const PROJECTIONS: Record<string, Mutation> = {
  'Sheet.setPixel': { on: seeded, run: (game) => game.sheets[0]?.setPixel(40, 40, 7) },
  'Sheet.setFlag': { on: seeded, run: (game) => game.sheets[0]?.setFlag(4, 0b10) },
  'GameMap.setTile': { on: seeded, run: (game) => game.maps[0]?.setTile(5, 5, 2) },
};

/** Public methods that only read. */
const READS = ['previewResize', 'actionNameIssue'];

/** Private and protected methods, which nothing outside the class calls. */
const INTERNAL = [
  'writeSheetPixel',
  'writeSheetFlag',
  'writeMapTile',
  'shapesAfterResize',
  'holdNumbered',
  'renumber',
  'describe',
  'writeAction',
  'inputsOf',
  'netPermissionsUnder',
  'restoreCollection',
  'restoreFiles',
  'dedupeEntryFile',
];

describe('the gate of an editable game', () => {
  it('has every method of the class declared as a mutator, a read or an internal', () => {
    const methods = Object.getOwnPropertyNames(EditableGame.prototype).filter(
      (name) => name !== 'constructor',
    );

    expect(methods.sort()).toEqual([...Object.keys(MUTATORS), ...READS, ...INTERNAL].sort());
  });

  describe.each(Object.entries({ ...MUTATORS, ...PROJECTIONS }))('%s', (_name, mutation) => {
    it('changes the document when the game may be written', () => {
      const { game, doc } = mutation.on();
      const before = Y.encodeStateAsUpdate(doc);

      mutation.run(game);

      expect(Y.encodeStateAsUpdate(doc)).not.toEqual(before);
    });

    it('leaves the document byte for byte when it may not', () => {
      const { game, doc, close } = mutation.on();
      const before = Y.encodeStateAsUpdate(doc);
      let updates = 0;
      doc.on('update', () => {
        updates++;
      });
      close();

      expect(() => {
        mutation.run(game);
      }).not.toThrow();

      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
      expect(updates).toBe(0);
    });
  });

  it('says by its answer whether the write ran, and does not run it when it may not', () => {
    const { game, close } = seeded();
    let ran = 0;
    const write = (): void => {
      ran++;
    };

    expect(game.transact(write)).toBe(true);
    close();
    expect(game.transact(write)).toBe(false);
    expect(ran).toBe(1);
  });

  it('answers a refused write the way each mutator answers a failed one', () => {
    const { game, close } = seeded();
    close();

    expect(game.addAction({ name: 'dash' })).toBeNull();
    expect(game.updateAction('pause', { label: 'Menu' })).toBe(false);
    expect(game.addFile('extra')).toBeNull();
  });

  it('is asked at every write, so a game closed and opened again is written again', () => {
    let open = false;
    const game = new EditableGame(new Y.Doc(), () => open);

    game.seedDefaults();
    expect(game.files).toHaveLength(0);

    open = true;
    game.seedDefaults();
    expect(game.files).toHaveLength(1);
  });

  it('still takes what comes from elsewhere: a load, a peer, a migration', () => {
    const { doc: source } = seeded();
    const doc = new Y.Doc();
    const game = new EditableGame(doc, () => false);

    Y.applyUpdate(doc, Y.encodeStateAsUpdate(source), 'remote');

    expect(game.files.map((file) => file.name)).toEqual(['main', 'helpers']);
    expect(game.maps[0]?.getTile(2, 2)).toBe(1);
  });
});

/** Every `.ts` under a directory that is not a test. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sources(path);
    }

    return entry.name.endsWith('.ts') && !/\.(test|bench)\.ts$/.test(entry.name) ? [path] : [];
  });
}

/**
 * A transaction opened on the document itself goes round the gate. Two are meant to: the gate,
 * and a migration, which runs whoever is looking since it is what makes an old game readable.
 */
it('opens a transaction on the document in the gate and in a migration, nowhere else', () => {
  const root = join(import.meta.dirname, '..');
  const found = sources(root).flatMap((path) =>
    (readFileSync(path, 'utf8').match(/\bdoc\??\.transact\(/g) ?? []).map(() =>
      relative(root, path),
    ),
  );

  expect(found.sort()).toEqual(['game/EditableGame.ts', 'migrations/index.ts']);
});
