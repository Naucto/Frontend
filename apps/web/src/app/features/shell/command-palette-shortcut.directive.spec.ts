import { Component } from '@angular/core';
import { DialogService } from '@naucto/ui';
import { render } from '@testing-library/angular';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { testProviders } from '../../testing/providers';
import { CommandPaletteComponent } from './command-palette.component';
import { CommandPaletteShortcutDirective } from './command-palette-shortcut.directive';

@Component({ template: '', hostDirectives: [CommandPaletteShortcutDirective] })
class Host {}

describe('CommandPaletteShortcutDirective', () => {
  const setUp = async (): Promise<{ open: ReturnType<typeof vi.fn>; close: () => void }> => {
    const closed = new Subject<void>();
    const close = (): void => {
      closed.next();
    };
    const open = vi.fn(() => ({ closed, close }));
    await render(Host, {
      providers: [...testProviders(), { provide: DialogService, useValue: { open } }],
    });
    return { open, close };
  };

  const press = (init: KeyboardEventInit): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    document.body.dispatchEvent(event);
    return event;
  };

  it('opens the palette on Ctrl-K and on ⌘-K, and closes it on the next one', async () => {
    const { open } = await setUp();

    expect(press({ key: 'k' }).defaultPrevented).toBe(false);
    expect(open).not.toHaveBeenCalled();

    expect(press({ key: 'k', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith(CommandPaletteComponent, expect.anything());

    press({ key: 'k', metaKey: true });
    expect(open).toHaveBeenCalledOnce();

    press({ key: 'k', metaKey: true });
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('stands down when a screen has kept the key for itself', async () => {
    const { open } = await setUp();
    const keep = (event: Event): void => {
      event.preventDefault();
    };
    document.addEventListener('keydown', keep);

    press({ key: 'k', ctrlKey: true });
    document.removeEventListener('keydown', keep);

    expect(open).not.toHaveBeenCalled();
  });
});
