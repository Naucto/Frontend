import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouteReuseStrategy, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { uuidOf } from '@naucto/api-client/testing';
import { DialogService, ToastService } from '@naucto/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { ProjectRouteReuseStrategy } from '../../app.config';
import { PresenceStore } from '../../core/presence/presence.store';
import { installMemoryStorage } from '../../testing/memory-storage';
import { testProviders } from '../../testing/providers';
import EditorShellComponent from './editor-shell.component';
import { EditorModeService } from './state/editor-mode.service';
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
    preview: signal<'staff' | 'own' | null>(null),
    open: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    setTab: vi.fn(),
  };

  const announce = vi.fn();

  beforeEach(() => {
    installMemoryStorage();
    session.status.set('ready');
    session.preview.set(null);
    announce.mockClear();
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
        EditorModeService,
        EditorRuntimeService,
        EditorUiStore,
        { provide: WorkSessionService, useValue: session },
        { provide: SessionSaveService, useValue: {} },
        {
          provide: SessionPresenceService,
          useValue: {
            collaborators: signal([]),
            setPlayer: vi.fn(),
            setView: () => undefined,
            peersIn: () => [],
          },
        },
        { provide: PresenceStore, useValue: { announce } },
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
    const first = await harness.navigateByUrl(`/edit/${uuidOf(7)}`, EditorShellComponent);
    expect(session.open).toHaveBeenCalledTimes(1);
    expect(session.open).toHaveBeenCalledWith(uuidOf(7));

    const second = await harness.navigateByUrl(`/edit/${uuidOf(9)}`, EditorShellComponent);

    expect(second).not.toBe(first);
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(session.open).toHaveBeenCalledTimes(2);
    expect(session.open).toHaveBeenLastCalledWith(uuidOf(9));
  });

  it('tells no friend a game is being built while it is only looked at', async () => {
    session.preview.set('staff');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/edit/${uuidOf(7)}`, EditorShellComponent);

    expect(session.open).toHaveBeenCalledWith(uuidOf(7));
    expect(announce).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'BUILDING' }));
  });

  /** Until the session is open nobody knows whether it is a live one. */
  it('announces the game being built once the session is open as a live one, not before', async () => {
    session.status.set('joining');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/edit/${uuidOf(7)}`, EditorShellComponent);
    expect(announce).not.toHaveBeenCalled();

    session.status.set('ready');
    harness.detectChanges();

    expect(announce).toHaveBeenCalledWith({ kind: 'BUILDING', projectId: uuidOf(7) });
  });
});
