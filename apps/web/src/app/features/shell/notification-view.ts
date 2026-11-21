import { type NotificationPayloadDto } from '@naucto/api-client';
import { type IconName, type OptionWash } from '@naucto/ui';

/** Where a notification leads: a route and, for a session invite, the way into the session. */
export interface NotificationDestination {
  path: string[];
  query?: { session: string; code?: string };
}

/**
 * Where a notification leads, or null. A session invite arrives under the generic kind carrying
 * its project, its session and the code that lets the invitee in, hence the default branch; being
 * removed from a project leads nowhere on purpose.
 */
export function destinationOf(
  notification: NotificationPayloadDto,
): NotificationDestination | null {
  const { projectId, sessionId, joinCode } = notification.data ?? {};
  switch (notification.kind) {
    case 'FRIEND_REQUEST':
    case 'FRIEND_ACCEPTED':
      return { path: ['/friends'] };
    case 'COLLABORATOR_ADDED':
      return typeof projectId === 'number' ? { path: ['/edit', String(projectId)] } : null;
    case 'COLLABORATOR_REMOVED':
      return null;
    default: {
      if (typeof projectId !== 'number') {
        return null;
      }
      const path = ['/play', String(projectId)];
      if (typeof sessionId !== 'string') {
        return { path };
      }
      return {
        path,
        query:
          typeof joinCode === 'string'
            ? { session: sessionId, code: joinCode }
            : { session: sessionId },
      };
    }
  }
}

export interface NotificationLook {
  /** The accent of its glyph, and of its title and wash while it is unread. */
  tone: OptionWash;
  icon: IconName;
}

const LOOKS: Record<NotificationPayloadDto['kind'], NotificationLook> = {
  GENERIC: { tone: 'sky', icon: 'info-box' },
  FRIEND_REQUEST: { tone: 'jade', icon: 'user' },
  FRIEND_ACCEPTED: { tone: 'jade', icon: 'users' },
  FEATURED: { tone: 'gold', icon: 'trophy' },
  COLLABORATOR_ADDED: { tone: 'sky', icon: 'folder-plus' },
  COLLABORATOR_REMOVED: { tone: 'sky', icon: 'folder-x' },
};

/** A warning is orange whatever it is about; an invite is told from the other generic ones. */
export function lookOf(notification: NotificationPayloadDto): NotificationLook {
  if (notification.type === 'WARNING') {
    return { tone: 'orange', icon: 'alert' };
  }
  if (destinationOf(notification)?.query) {
    return { tone: 'sky', icon: 'gamepad' };
  }
  return LOOKS[notification.kind];
}
