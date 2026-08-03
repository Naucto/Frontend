import {
  MultiplayerDirectoryFlags,
  MultiplayerDirectorySettings,
  MultiplayerSettingsProvider,
} from "@providers/editors/MultiplayerSettingsProvider";

import { netPermissionsFromSettings } from "./netPermissions";

// A minimal stand-in for the Yjs-backed provider: `resolved` maps a queried path
// to the directory the real getDirectorySettings would walk up to (undefined when
// nothing below the root is configured), and `root` is the root node.
const stubSettings = (
  root: MultiplayerDirectorySettings,
  resolved: Record<string, MultiplayerDirectorySettings> = {},
): MultiplayerSettingsProvider =>
  ({
    getDirectorySettings: (path: string) => resolved[path],
    getRootDirectorySettings: () => root,
  }) as unknown as MultiplayerSettingsProvider;

const dir = (path: string, flags: MultiplayerDirectoryFlags): MultiplayerDirectorySettings =>
  new MultiplayerDirectorySettings(path, { flags });

describe("netPermissionsFromSettings", () => {
  it("allows any path when only the auto-created root at NONE exists", () => {
    const perms = netPermissionsFromSettings(stubSettings(dir("", MultiplayerDirectoryFlags.NONE)));

    expect(perms.canClientRead("score")).toBe(true);
    expect(perms.canClientWrite("pads.1.x")).toBe(true);
    expect(perms.canClientRead("")).toBe(true);
  });

  it("enforces root flags on descendant paths with no configured ancestor", () => {
    // Root is read-only for clients (CLIENT_READ granted, CLIENT_WRITE withheld).
    const root = dir("", MultiplayerDirectoryFlags.CLIENT_READ);
    const perms = netPermissionsFromSettings(stubSettings(root));

    expect(perms.canClientRead("score")).toBe(true);
    expect(perms.canClientWrite("score")).toBe(false);
  });

  it("honors a configured node that denies a flag via can()", () => {
    const root = dir("", MultiplayerDirectoryFlags.NONE);
    const node = dir("score", MultiplayerDirectoryFlags.CLIENT_READ);
    const perms = netPermissionsFromSettings(stubSettings(root, { score: node }));

    expect(perms.canClientRead("score")).toBe(true);
    expect(perms.canClientWrite("score")).toBe(false);
  });
});
