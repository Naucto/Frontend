import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { render } from '@testing-library/angular';

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
