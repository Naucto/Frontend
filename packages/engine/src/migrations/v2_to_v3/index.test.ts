import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { EditableGame } from '../../game/EditableGame';
import { KEYS, LEGACY_KEYS } from '../../game/keys';
import { defaultPattern, type Pattern } from '../../sound/model';
import { migrateGame } from '../index';
import type { V2Song } from './legacy';

function v2Doc(
  patterns: Pattern[],
  songs: Record<string, V2Song>,
  sfx: Record<string, string> = {},
  code = '',
): Y.Doc {
  const doc = new Y.Doc();
  const game = new EditableGame(doc);
  game.seedDefaults();
  doc.getMap(KEYS.meta).set('schemaVersion', 2);
  for (const pattern of patterns) {
    game.setPattern(pattern);
  }
  const songMap = doc.getMap<string>(KEYS.songs);
  for (const [slot, song] of Object.entries(songs)) {
    songMap.set(slot, JSON.stringify(song));
  }
  const slots = doc.getMap<string>(LEGACY_KEYS.sfxSlots);
  for (const [slot, id] of Object.entries(sfx)) {
    slots.set(slot, id);
  }
  const main = game.files[0];
  main?.text.delete(0, main.text.length);
  main?.text.insert(0, code);
  game.destroy();

  return doc;
}

const pattern = (id: string, bpm: number, steps: number): Pattern => ({
  ...defaultPattern(id),
  name: `pattern ${id}`,
  bpm,
  steps,
  stepsPerBeat: 4,
  notes: [{ step: 0, pitch: 60, length: 1, instrument: 'lead', volume: 1 }],
});

describe('migrateV2ToV3', () => {
  it('lays the old chain end to end, a hole as one bar of silence', () => {
    const doc = v2Doc([pattern('a', 120, 32), pattern('b', 120, 16)], {
      '0': { name: 'theme', sequence: ['a', null, 'b', 'gone', 'a'], loop: true, loopStart: 2 },
    });

    const report = migrateGame(doc);

    const song = new EditableGame(doc).getSongs().get('0');
    expect(song).toEqual({
      name: 'theme',
      bpm: 120,
      blocks: [
        { id: 'b0', pattern: 'a', start: 0, repeat: 1 },
        { id: 'b2', pattern: 'b', start: 3, repeat: 1 },
        { id: 'b4', pattern: 'a', start: 4, repeat: 1 },
      ],
      loop: true,
      loopStart: 3,
    });
    expect(report.warnings.map((warning) => warning.message)).toEqual([
      'music 0: an empty place used to end the music; it is now one bar of silence and what follows it plays',
    ]);
  });

  it('takes the tempo of the first pattern and says when the others differed', () => {
    const doc = v2Doc([pattern('a', 150, 16), pattern('b', 100, 16)], {
      '3': { name: '', sequence: ['a', 'b'], loop: false, loopStart: 0 },
    });

    const report = migrateGame(doc);

    expect(new EditableGame(doc).getSongs().get('3')?.bpm).toBe(150);
    expect(report.warnings).toEqual([
      {
        step: 'sound',
        message:
          'music 3: its patterns had different tempos (150, 100 bpm); the whole music now plays at 150 bpm',
      },
    ]);
  });

  it('copies the pattern each SFX slot named into the slot, and empties the old slots', () => {
    const doc = v2Doc([pattern('a', 240, 8)], {}, { '0': 'a', '5': 'gone' });

    migrateGame(doc);

    const sfx = new EditableGame(doc).getSfx();
    expect([...sfx.keys()]).toEqual(['0']);
    expect(sfx.get('0')).toEqual({
      name: 'pattern a',
      bpm: 240,
      stepsPerBeat: 4,
      steps: 8,
      notes: [{ step: 0, pitch: 60, length: 1, instrument: 'lead', volume: 1 }],
    });
    expect(doc.getMap(LEGACY_KEYS.sfxSlots).size).toBe(0);
  });

  it('warns on the lines whose sound calls changed meaning', () => {
    const doc = v2Doc(
      [],
      {},
      {},
      [
        'local bar, beat = sound.music_pos()',
        'sound.set_pattern(1, { steps = 16 })',
        'sound.set_pattern(2, { bpm = 90 })',
        '-- sound.music_pos() in a comment',
      ].join('\n'),
    );

    const report = migrateGame(doc);

    expect(report.warnings.map((warning) => [warning.step, warning.line])).toEqual([
      ['code', 1],
      ['code', 3],
    ]);
  });

  it('writes the musics, the patterns and the sound effects in the compact form', () => {
    const doc = v2Doc(
      [pattern('a', 120, 16)],
      { '0': { name: '', sequence: ['a'], loop: true, loopStart: 0 } },
      { '0': 'a' },
    );

    migrateGame(doc);

    const raw = (key: string, id: string): unknown =>
      JSON.parse(doc.getMap<string>(key).get(id) ?? 'null');
    expect(raw(KEYS.songs, '0')).toMatchObject({ blocks: [['b0', 'a', 0]] });
    expect(raw(KEYS.patterns, 'a')).toMatchObject({ notes: [[0, 60, 1, 'lead']] });
    expect(raw(KEYS.sfx, '0')).toMatchObject({ notes: [[0, 60, 1, 'lead']] });
  });

  it('leaves a document it has migrated alone', () => {
    const doc = v2Doc([pattern('a', 120, 16)], {
      '0': { name: '', sequence: ['a'], loop: true, loopStart: 0 },
    });
    migrateGame(doc);

    expect(migrateGame(doc).applied).toBe(false);
  });
});
