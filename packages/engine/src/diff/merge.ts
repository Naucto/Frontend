import * as Y from 'yjs';

import { EditableGame } from '../game/EditableGame';
import { SPRITE_SIZE } from '../game/keys';
import type { Pattern, Sfx, Song } from '../sound/model';
import { type ChangeItem, fileDiffs, type SoundChange } from './changes';
import { mergeLines } from './lines';

/** The order a merge takes changes in: a grid exists and has its size before its cells are set. */
const STAGE: Record<ChangeItem['type'], number> = {
  sheet: 0,
  map: 0,
  'sheet-size': 1,
  'map-size': 1,
  'sheet-cell': 2,
  'sheet-flags': 2,
  'map-area': 2,
  palette: 2,
  'code-file': 0,
  'code-name': 1,
  'code-hunk': 2,
  net: 2,
  sound: 2,
};

function writeSound(game: EditableGame, change: SoundChange): void {
  const { part, id, after } = change;
  if (after === null) {
    game.transact(() => {
      game[part].delete(id);
    });
    return;
  }
  switch (part) {
    case 'patterns':
      game.setPattern(after as Pattern);
      break;
    case 'songs':
      game.setSong(Number(id), after as Song);
      break;
    case 'sfx':
      game.setSfx(Number(id), after as Sfx);
      break;
    case 'instruments':
      game.transact(() => {
        game.instruments.set(id, JSON.stringify(after));
      });
      break;
    case 'samples':
      game.transact(() => {
        game.samples.set(id, after as string);
      });
      break;
  }
}

/**
 * The document `current` becomes when the changes of `accepted` are taken from `proposed` and
 * everything else is left as `current` has it, as a full Yjs state. `current` itself is not
 * touched: the caller puts the result back through `EditableGame.restoreFrom`, the gate every
 * edit goes through.
 */
export function mergeAccepted(
  current: Y.Doc,
  proposed: EditableGame,
  items: readonly ChangeItem[],
  accepted: ReadonlySet<string>,
): Uint8Array {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(current));
  const game = new EditableGame(doc);
  try {
    const taken = items
      .filter((item) => accepted.has(item.key))
      .sort((a, b) => STAGE[a.type] - STAGE[b.type]);
    const hunksTaken = new Map<string, Set<number>>();
    for (const item of taken) {
      switch (item.type) {
        case 'code-file':
          if (item.kind === 'DELETED') {
            game.removeFile(item.fileId);
          } else {
            game.addFile(item.name, item.after, item.fileId);
          }
          break;
        case 'code-name':
          game.renameFile(item.fileId, item.after);
          break;
        case 'code-hunk': {
          const held = hunksTaken.get(item.fileId) ?? new Set<number>();
          held.add(item.index);
          hunksTaken.set(item.fileId, held);
          break;
        }
        case 'sheet': {
          if (item.kind === 'DELETED') {
            game.removeSheet(item.id);
            break;
          }
          const source = proposed.sheets.find((sheet) => sheet.id === item.id);
          if (!source) {
            break;
          }
          game.addSheet(source.name, source.width, source.height, source.id);
          const made = game.sheets.find((sheet) => sheet.id === item.id);
          game.transact(() => {
            for (let y = 0; y < source.height; y += 1) {
              for (let x = 0; x < source.width; x += 1) {
                const colour = source.getPixel(x, y);
                if (colour) {
                  made?.setPixel(x, y, colour);
                }
              }
            }
            for (let local = 0; local < source.count; local += 1) {
              const flag = source.getFlag(source.base + local);
              if (flag && made) {
                made.setFlag(made.base + local, flag);
              }
            }
          });
          break;
        }
        case 'map': {
          if (item.kind === 'DELETED') {
            game.removeMap(item.id);
            break;
          }
          const source = proposed.maps.find((map) => map.id === item.id);
          if (!source) {
            break;
          }
          game.addMap(source.name, source.width, source.height, source.id);
          const made = game.maps.find((map) => map.id === item.id);
          game.transact(() => {
            for (let y = 0; y < source.height; y += 1) {
              for (let x = 0; x < source.width; x += 1) {
                const tile = source.getTile(x, y);
                if (tile) {
                  made?.setTile(x, y, tile);
                }
              }
            }
          });
          break;
        }
        case 'sheet-size':
          game.resizeSheet(item.id, item.after.width, item.after.height);
          break;
        case 'map-size':
          game.resizeMap(item.id, item.after.width, item.after.height);
          break;
        case 'sheet-cell': {
          const sheet = game.sheets.find((held) => held.id === item.sheetId);
          game.transact(() => {
            for (let y = 0; y < SPRITE_SIZE; y += 1) {
              for (let x = 0; x < SPRITE_SIZE; x += 1) {
                sheet?.setPixel(
                  item.col * SPRITE_SIZE + x,
                  item.row * SPRITE_SIZE + y,
                  item.after[y * SPRITE_SIZE + x] ?? 0,
                );
              }
            }
          });
          break;
        }
        case 'sheet-flags': {
          const sheet = game.sheets.find((held) => held.id === item.sheetId);
          sheet?.setFlag(sheet.base + item.row * sheet.cols + item.col, item.after);
          break;
        }
        case 'map-area': {
          const map = game.maps.find((held) => held.id === item.mapId);
          game.transact(() => {
            for (let i = 0; i < item.cells.length; i += 4) {
              map?.setTile(item.cells[i] ?? 0, item.cells[i + 1] ?? 0, item.cells[i + 3] ?? 0);
            }
          });
          break;
        }
        case 'palette':
          game.setPaletteColour(item.index, item.after);
          break;
        case 'net':
          if (item.after === null) {
            game.removeNetPermissions(item.path);
          } else if (item.after.flags !== undefined) {
            game.setNetPermission(item.path, item.after.flags);
          } else if (item.before === null) {
            game.declareNetPath(item.path);
          } else {
            game.inheritNetPermission(item.path);
          }
          break;
        case 'sound':
          writeSound(game, item);
          break;
      }
    }
    if (hunksTaken.size) {
      const diffs = fileDiffs(game, proposed);
      for (const [fileId, indexes] of hunksTaken) {
        const diff = diffs.get(fileId);
        const file = game.files.find((held) => held.id === fileId);
        if (!diff || !file) {
          continue;
        }
        const text = mergeLines(diff.rows, diff.hunks, indexes);
        game.transact(() => {
          file.text.delete(0, file.text.length);
          file.text.insert(0, text);
        });
      }
    }
    return Y.encodeStateAsUpdate(doc);
  } finally {
    game.destroy();
    doc.destroy();
  }
}

/**
 * What the editors draw while diff mode is on: every change not refused, as it would be once
 * kept, so a change is seen where it lands. A removal still waiting is not taken: what it would
 * remove stays drawn, for the hatch over it to say it goes.
 */
export function displayState(
  current: Y.Doc,
  proposed: EditableGame,
  items: readonly ChangeItem[],
  decisions: ReadonlyMap<string, 'pending' | 'ok' | 'no'>,
): Uint8Array {
  const shown = items.filter((item) => {
    const decision = decisions.get(item.key) ?? 'pending';
    return decision === 'ok' || (decision === 'pending' && item.kind !== 'DELETED');
  });
  return mergeAccepted(current, proposed, items, new Set(shown.map((item) => item.key)));
}
