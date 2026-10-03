import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ClipboardStore } from './clipboard.store';

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
});
