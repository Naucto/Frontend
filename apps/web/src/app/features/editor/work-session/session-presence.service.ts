import { computed, inject, Injectable, signal } from '@angular/core';
import type { PresenceColour } from '@naucto/ui';
import type { Awareness } from 'y-protocols/awareness';

import { AuthStore } from '../../../core/auth/auth.store';
import { assignColours } from './presence-colours';

export interface CanvasCursor {
  tab: string;
  /**
   * Which surface inside the tab, where a tab has more than one, so a pointer is drawn only for
   * peers looking at the same one.
   */
  scope?: string;
  x: number;
  y: number;
}

export interface SessionSelection {
  tab: string;
  scope?: string;
  items: string[];
}

export interface SessionView {
  tab: string;
  pane?: string;
  /** What the pane has open, such as `pattern:3`, so the others can mark it in their lists. */
  item?: string;
}

export interface Collaborator {
  clientId: number;
  userId: number;
  name: string;
  colour: PresenceColour;
  cursor?: CanvasCursor;
  view?: SessionView;
  selection?: SessionSelection;
  isSelf: boolean;
}

/** What each client publishes about itself in the room's awareness. */
export interface AwarenessState {
  userId?: number;
  name?: string;
  cursor?: CanvasCursor;
  view?: SessionView;
  selection?: SessionSelection;
}

/**
 * Who is in the room with this client and where their pointers are, read from the session's
 * y-protocols awareness while it is connected.
 */
@Injectable()
export class SessionPresenceService {
  private readonly auth = inject(AuthStore);
  private readonly connected = signal<Awareness | null>(null);
  /** The last state each client shared, kept so a departure can still say who left. */
  private readonly known = new Map<number, AwarenessState>();
  private view: SessionView | undefined;

  /** y-protocols awareness of the live session (null until connected). */
  readonly awareness = this.connected.asReadonly();
  readonly collaborators = signal<Collaborator[]>([]);
  readonly myColour = computed<PresenceColour>(
    () => this.collaborators().find((collaborator) => collaborator.isSelf)?.colour ?? 'sky',
  );

  private refreshCollaborators(): void {
    const awareness = this.connected();
    if (!awareness) {
      return;
    }
    const states = awareness.getStates() as Map<number, AwarenessState>;
    const ids = [...states.values()]
      .map((state) => state.userId)
      .filter((userId): userId is number => typeof userId === 'number');
    const colours = assignColours(ids);
    const list: Collaborator[] = [];
    states.forEach((state, clientId) => {
      if (typeof state.userId !== 'number') {
        return;
      }
      this.known.set(clientId, state);
      list.push({
        clientId,
        userId: state.userId,
        name: state.name ?? `user ${String(state.userId)}`,
        colour: colours.get(state.userId) ?? 'sky',
        cursor: state.cursor,
        view: state.view,
        selection: state.selection,
        isSelf: clientId === awareness.clientID,
      });
    });
    this.collaborators.set(list.sort((a, b) => a.userId - b.userId));
  }

  /** Starts telling the room who this client is. */
  connect(awareness: Awareness): void {
    awareness.setLocalState({
      userId: this.auth.userId() ?? undefined,
      name: this.auth.displayName(),
      view: this.view,
    } satisfies AwarenessState);
    this.connected.set(awareness);
    this.refreshCollaborators();
  }

  disconnect(): void {
    this.connected.set(null);
  }

  /** Re-reads the room after an awareness change, and returns what each departed client last shared. */
  refresh(removed: number[]): AwarenessState[] {
    const gone = removed
      .map((clientId) => this.known.get(clientId))
      .filter((state): state is AwarenessState => !!state);
    for (const clientId of removed) {
      this.known.delete(clientId);
    }
    this.refreshCollaborators();
    return gone;
  }

  /** How many clients are in the room, this one included; 0 while disconnected. */
  peerCount(): number {
    return this.connected()?.getStates().size ?? 0;
  }

  isPresent(userId: number): boolean {
    const states = (this.connected()?.getStates() ?? new Map()) as Map<number, AwarenessState>;
    return [...states.values()].some((state) => state.userId === userId);
  }

  setView(view: SessionView): void {
    if (
      this.view?.tab === view.tab &&
      this.view.pane === view.pane &&
      this.view.item === view.item
    ) {
      return;
    }
    this.view = view;
    this.connected()?.setLocalStateField('view', view);
  }

  setSelection(selection: SessionSelection | null): void {
    const awareness = this.connected();
    if (!awareness) {
      return;
    }
    const previous = (awareness.getLocalState() as AwarenessState | null)?.selection;
    const next = selection?.items.length ? selection : undefined;
    if (
      previous?.tab === next?.tab &&
      previous?.scope === next?.scope &&
      (previous?.items ?? []).join() === (next?.items ?? []).join()
    ) {
      return;
    }
    awareness.setLocalStateField('selection', next);
  }

  peersIn(tab: string, pane?: string): Collaborator[] {
    return this.collaborators().filter(
      (collaborator) =>
        !collaborator.isSelf &&
        collaborator.view?.tab === tab &&
        (pane === undefined || collaborator.view.pane === pane),
    );
  }

  /** Share where this user's pointer is on an editor canvas (null when it leaves). */
  setCursor(cursor: CanvasCursor | null): void {
    const awareness = this.connected();
    if (!awareness) {
      return;
    }
    const previous = (awareness.getLocalState() as AwarenessState | null)?.cursor;
    if (
      previous?.tab === cursor?.tab &&
      previous?.scope === cursor?.scope &&
      previous?.x === cursor?.x &&
      previous?.y === cursor?.y
    ) {
      return;
    }
    awareness.setLocalStateField('cursor', cursor ?? undefined);
  }
}
