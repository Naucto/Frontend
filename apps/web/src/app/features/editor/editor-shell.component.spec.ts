import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouteReuseStrategy, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ProjectRouteReuseStrategy } from '@app/app.config';
import { AuthStore } from '@app/core/auth/auth.store';
import { PresenceStore } from '@app/core/presence/presence.store';
import { testProviders } from '@app/testing/providers';
import { DialogService, ToastService } from '@naucto/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { installMemoryStorage } from '../../testing/memory-storage';
import { EditorShellComponent } from './editor-shell.component';
import { EditorRuntimeService } from './state/editor-runtime.service';
import { EditorUiStore } from './state/editor-ui.store';
import { WorkSessionService } from './work-session/work-session.service';

/**
 * A notification can navigate to a project other than the open one; the shell opens one session
 * per instance, so a change of `:id` has to build another shell.
 */
describe('EditorShellComponent', () => {
  const session = {
    doc: new Y.Doc(),
    game: null,
    status: signal('ready'),
    error: signal<string | null>(null),
    project: signal(null),
    collaborators: signal([]),
    isCollaborator: signal(true),
    open: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    setTab: vi.fn(),
  };

  beforeEach(() => {
    installMemoryStorage();
    session.open.mockClear();
    session.close.mockClear();
    session.setTab.mockClear();
    // jsdom has no ResizeObserver, and the shell measures the window through one.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [EditorShellComponent],
      providers: [
        ...testProviders(),
        provideRouter(
          [{ path: 'edit/:id', component: EditorShellComponent }],
          withComponentInputBinding(),
        ),
        { provide: RouteReuseStrategy, useClass: ProjectRouteReuseStrategy },
        EditorRuntimeService,
        EditorUiStore,
        { provide: WorkSessionService, useValue: session },
        { provide: PresenceStore, useValue: { announce: vi.fn() } },
        { provide: AuthStore, useValue: {} },
        { provide: DialogService, useValue: { open: vi.fn() } },
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    });
    // The template and the shell's own providers are the shell's business: what is at stake here
    // is the class, and the providers would each build a session of their own.
    TestBed.overrideComponent(EditorShellComponent, { set: { template: '', providers: [] } });
  });

  it('opens the session on the id in the URL, and reopens it in a new shell when the id changes', async () => {
    const harness = await RouterTestingHarness.create();
    const first = await harness.navigateByUrl('/edit/7', EditorShellComponent);
    expect(session.open).toHaveBeenCalledTimes(1);
    expect(session.open).toHaveBeenCalledWith(7);

    const second = await harness.navigateByUrl('/edit/9', EditorShellComponent);

    expect(second).not.toBe(first);
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(session.open).toHaveBeenCalledTimes(2);
    expect(session.open).toHaveBeenLastCalledWith(9);
  });
});
