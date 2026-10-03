import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ClipboardStore, type ClipboardSurface } from './clipboard.store';

describe('ClipboardStore', () => {
  const store = (): InstanceType<typeof ClipboardStore> =>
    TestBed.configureTestingModule({ providers: [ClipboardStore] }).inject(ClipboardStore);

  it('hands a clip back only to the editor whose kind it is', () => {
    const clipboard = store();
    clipboard.put({ kind: 'pixels', w: 1, h: 1, cells: new Uint8Array([3]) });
    expect(clipboard.take('pixels')?.cells).toBeInstanceOf(Uint8Array);
    expect(clipboard.take('tiles')).toBeNull();

    clipboard.put({ kind: 'tiles', w: 1, h: 1, cells: new Uint16Array([300]) });
    expect(clipboard.take('tiles')?.cells).toBeInstanceOf(Uint16Array);
    expect(clipboard.take('pixels')).toBeNull();
  });

  /** A tile is a sprite number, and the second sheet's sprites start at 256. */
  it('keeps a tile from the second sheet whole', () => {
    const clipboard = store();
    clipboard.put({ kind: 'tiles', w: 2, h: 1, cells: new Uint16Array([256, 511]) });
    const clip = clipboard.take('tiles');
    expect(clip && Array.from(clip.cells)).toEqual([256, 511]);
  });

  describe('transfer', () => {
    const surface = (
      selected: boolean,
      copied: number[] | null,
    ): { log: string[]; surface: ClipboardSurface<'pixels'> } => {
      const log: string[] = [];
      return {
        log,
        surface: {
          kind: 'pixels' as const,
          copy: () =>
            copied && {
              kind: 'pixels' as const,
              w: copied.length,
              h: 1,
              cells: Uint8Array.from(copied),
            },
          hasSelection: () => selected,
          clear: () => {
            log.push('clear');
          },
          paste: (clip) => {
            log.push(`paste ${Array.from(clip.cells).join()}`);
          },
        },
      };
    };

    it('copies what the surface offers, even past its selection', () => {
      const clipboard = store();
      const { surface: canvas, log } = surface(false, [7]);
      expect(clipboard.transfer('c', canvas)).toBe(true);
      expect(clipboard.take('pixels')?.cells).toEqual(Uint8Array.from([7]));
      expect(log).toEqual([]);
    });

    it('cuts the selection or nothing at all', () => {
      const clipboard = store();
      const unselected = surface(false, [7]);
      expect(clipboard.transfer('x', unselected.surface)).toBe(true);
      expect(clipboard.take('pixels')).toBeNull();
      expect(unselected.log).toEqual([]);

      const selected = surface(true, [7]);
      clipboard.transfer('x', selected.surface);
      expect(clipboard.take('pixels')?.cells).toEqual(Uint8Array.from([7]));
      expect(selected.log).toEqual(['clear']);
    });

    it('pastes only a clip of its own kind, and leaves other keys alone', () => {
      const clipboard = store();
      const { surface: canvas, log } = surface(true, null);
      clipboard.put({ kind: 'tiles', w: 1, h: 1, cells: new Uint16Array([300]) });
      expect(clipboard.transfer('v', canvas)).toBe(true);
      clipboard.put({ kind: 'pixels', w: 1, h: 1, cells: new Uint8Array([4]) });
      clipboard.transfer('v', canvas);
      expect(log).toEqual(['paste 4']);
      expect(clipboard.transfer('a', canvas)).toBe(false);
    });
  });
});
