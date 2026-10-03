import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { testProviders } from '../../testing/providers';
import { GameScreenComponent } from './game-screen.component';
import { RuntimeHostService } from './runtime-host.service';

/** Stands in for the editor shell, which owns the runtime its tabs read. */
@Component({
  selector: 'nc-runtime-owner',
  imports: [GameScreenComponent],
  providers: [RuntimeHostService],
  template: '<nc-game-screen [game]="null" />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class RuntimeOwnerHarness {
  readonly own = inject(RuntimeHostService);
  readonly screen = viewChild.required(GameScreenComponent);
}

@Component({
  selector: 'nc-plain-host',
  imports: [GameScreenComponent],
  template: '<nc-game-screen [game]="null" />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class PlainHostHarness {
  readonly screen = viewChild.required(GameScreenComponent);
}

describe('GameScreenComponent runtime ownership', () => {
  it('reuses the runtime its host provides', async () => {
    // The editor's CODE and GAME tabs inject the shell's instance: if the screen made its own,
    // their error and FPS readouts would watch an engine that is never mounted.
    const { fixture } = await render(RuntimeOwnerHarness, { providers: testProviders() });
    const host = fixture.componentInstance;
    expect(host.screen().runtime).toBe(host.own);
  });

  it('creates its own runtime when nothing above it provides one', async () => {
    const { fixture } = await render(PlainHostHarness, { providers: testProviders() });
    expect(fixture.componentInstance.screen().runtime).toBeInstanceOf(RuntimeHostService);
  });
});

@Component({
  selector: 'nc-debug-host',
  imports: [GameScreenComponent],
  providers: [RuntimeHostService],
  template: '<nc-game-screen [game]="null" debug />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class DebugHostHarness {
  readonly own = inject(RuntimeHostService);
}

describe('GameScreenComponent on a halted game', () => {
  const halt = (host: RuntimeHostService): void => {
    host.state.set('halted');
    host.error.set({ phase: 'update', message: 'boom', kind: 'runtime', file: 'main', line: 3 });
  };

  it('tells a player the game stopped, where, and offers a restart', async () => {
    const { fixture } = await render(RuntimeOwnerHarness, { providers: testProviders() });
    const host = fixture.componentInstance.own;
    halt(host);
    fixture.detectChanges();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('The game stopped on an error');
    expect(alert.textContent).toContain('main:3 · update: boom');

    const restart = vi.spyOn(host, 'restart').mockImplementation(() => undefined);
    await userEvent.click(within(alert).getByRole('button', { name: 'Restart' }));
    expect(restart).toHaveBeenCalledOnce();
  });

  it('leaves the editor to its console', async () => {
    const { fixture } = await render(DebugHostHarness, { providers: testProviders() });
    halt(fixture.componentInstance.own);
    fixture.detectChanges();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
