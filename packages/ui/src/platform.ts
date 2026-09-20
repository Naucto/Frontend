/**
 * What to call the modifier key in front of a shortcut.
 *
 * A label only: which modifier a shortcut answers to is settled where it is handled, so getting
 * this wrong misnames a key rather than breaking one.
 */
export function modifierLabel(): string {
  const platform =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform;

  return /mac|iphone|ipad|ipod/i.test(platform ?? '') ? '⌘' : 'CTRL';
}

export function shortcutLabel(key: string): string {
  const mod = modifierLabel();

  return mod === '⌘' ? `${mod}${key}` : `${mod} ${key}`;
}
