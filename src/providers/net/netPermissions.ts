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
    // getDirectorySettings walks up to the nearest configured ancestor but stops
    // before the root, so fall back to the root node explicitly — otherwise flags
    // a developer set on the root are silently unenforced for paths that have no
    // configured intermediate ancestor.
    const dir = settings.getDirectorySettings(path) ?? settings.getRootDirectorySettings();

    if (dir.isRootNode && dir.data.flags === MultiplayerDirectoryFlags.NONE)
      return true;

    return dir.can(flag);
  };

  return {
    canClientWrite: (path) => resolve(path, MultiplayerDirectoryFlags.CLIENT_WRITE),
    canClientRead: (path) => resolve(path, MultiplayerDirectoryFlags.CLIENT_READ),
  };
}
