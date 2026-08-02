import { NetPermissions } from "@engine/net/NetPermissions";
import {
  MultiplayerDirectoryFlags,
  MultiplayerSettingsProvider,
} from "@providers/editors/MultiplayerSettingsProvider";

// Adapt the editor's per-path permission tree into the runtime NetPermissions the
// host enforces. Flags inherit from the nearest configured ancestor (that is what
// getDirectorySettings resolves). Allow-by-default: an untouched project has only
// the auto-created root at NONE, which we treat as "unconfigured" so existing
// games keep working; a developer opts into restrictions by configuring nodes.
export function netPermissionsFromSettings(
  settings: MultiplayerSettingsProvider,
): NetPermissions {
  const resolve = (path: string, flag: MultiplayerDirectoryFlags): boolean => {
    const dir = settings.getDirectorySettings(path);

    if (!dir)
      return true;

    if (dir.isRootNode && dir.data.flags === MultiplayerDirectoryFlags.NONE)
      return true;

    return dir.can(flag);
  };

  return {
    canClientWrite: (path) => resolve(path, MultiplayerDirectoryFlags.CLIENT_WRITE),
    canClientRead: (path) => resolve(path, MultiplayerDirectoryFlags.CLIENT_READ),
  };
}
