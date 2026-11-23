import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouteReuseStrategy, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { DialogService, ToastService } from '@naucto/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { ProjectRouteReuseStrategy } from '../../app.config';
import { AuthStore } from '../../core/auth/auth.store';
import { PresenceStore } from '../../core/presence/presence.store';
import { installMemoryStorage } from '../../testing/memory-storage';
import { testProviders } from '../../testing/providers';
import EditorShellComponent from './editor-shell.component';
import { EditorRuntimeService } from './state/editor-runtime.service';
import { EditorUiStore } from './state/editor-ui.store';
import { SessionPresenceService } from './work-session/session-presence.service';
import { SessionSaveService } from './work-session/session-save.service';
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
    isCollaborator: signal(true),
    readOnly: signal(false),
    open: vi.fn(() => Promise.resolve()),
    openPreview: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    setTab: vi.fn(),
  };

  const suspension = signal<{ since: string; until: string | null } | null>(null);
  const announce = vi.fn();

  beforeEach(() => {
    installMemoryStorage();
    suspension.set(null);
    announce.mockClear();
    session.openPreview.mockClear();
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
          [
            { path: 'edit/:id', component: EditorShellComponent },
            {
              path: 'staff/edit/:id',
              component: EditorShellComponent,
              data: { preview: 'staff' },
            },
          ],
          withComponentInputBinding(),
        ),
        { provide: RouteReuseStrategy, useClass: ProjectRouteReuseStrategy },
        EditorRuntimeService,
        EditorUiStore,
        { provide: WorkSessionService, useValue: session },
        { provide: SessionSaveService, useValue: {} },
        {
          provide: SessionPresenceService,
          useValue: { collaborators: signal([]), setView: () => undefined, peersIn: () => [] },
        },
        { provide: PresenceStore, useValue: { announce } },
        { provide: AuthStore, useValue: { suspension } },
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

  it('opens a game to look at on the staff route, and tells no friend it is being built', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/staff/edit/7', EditorShellComponent);

    expect(session.openPreview).toHaveBeenCalledWith(7, 'staff');
    expect(session.open).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'BUILDING' }));
  });

  it('opens a suspended account its own game to look at', async () => {
    suspension.set({ since: '2026-11-01T00:00:00.000Z', until: null });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/edit/7', EditorShellComponent);

    expect(session.openPreview).toHaveBeenCalledWith(7, 'own');
    expect(session.open).not.toHaveBeenCalled();
  });

  it('announces the game being built in the editor proper', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/edit/7', EditorShellComponent);

    expect(announce).toHaveBeenCalledWith({ kind: 'BUILDING', projectId: 7 });
  });
});
