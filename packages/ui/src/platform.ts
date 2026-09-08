/**
 * What to call the modifier key in front of a shortcut.
 *
 * Every handler in the app accepts `ctrlKey || metaKey`, so the shortcut itself works either way;
 * this is only what a person is told to press. Apple keyboards have no Ctrl in that role, and
 * everyone else has no ⌘, so naming one of them everywhere tells half the readers to press a key
 * they do not have.
 */
export function modifierLabel(): string {
  const platform =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform;

  return /mac|iphone|ipad|ipod/i.test(platform ?? '') ? '⌘' : 'CTRL';
}

/** The same, spelled as a whole shortcut: `⌘K`, or `CTRL K` where a symbol would run into the key. */
export function shortcutLabel(key: string): string {
  const mod = modifierLabel();

  return mod === '⌘' ? `${mod}${key}` : `${mod} ${key}`;
}
