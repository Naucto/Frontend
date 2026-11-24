import { type NotificationPayloadDto } from '@naucto/api-client';
import { type IconName, type OptionWash } from '@naucto/ui';

/** Where a notification leads: a route and, for a session invite, the way into the session. */
interface NotificationDestination {
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
      return typeof projectId === 'string' ? { path: ['/edit', projectId] } : null;
    case 'COLLABORATOR_REMOVED':
      return null;
    // A decision about a game carries its project, and that game may be the very thing that is
    // no longer there to open. The standing says what was decided and why.
    case 'MODERATION':
      return { path: ['/settings', 'standing'] };
    default: {
      if (typeof projectId !== 'string') {
        return null;
      }
      const path = ['/play', projectId];
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

interface NotificationLook {
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
  MODERATION: { tone: 'orange', icon: 'flag' },
};

/**
 * A moderator's decision keeps its own glyph though it arrives as a warning; any other warning is
 * orange whatever it is about; an invite is told from the other generic ones.
 */
export function lookOf(notification: NotificationPayloadDto): NotificationLook {
  if (notification.type === 'WARNING' && notification.kind !== 'MODERATION') {
    return { tone: 'orange', icon: 'alert' };
  }
  if (destinationOf(notification)?.query) {
    return { tone: 'sky', icon: 'gamepad' };
  }
  return LOOKS[notification.kind];
}
