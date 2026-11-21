import type { TranslocoService } from '@jsverse/transloco';

const TAG_KEY = 'tag:';

/** The tag a shelf key names; null for a shelf that is not a tag's. */
export function shelfTag(key: string): string | null {
  return key.startsWith(TAG_KEY) ? key.slice(TAG_KEY.length) : null;
}

export const capitalised = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** What a shelf is called: a tag's shelf by its tag, the others by their name. */
export function shelfTitle(key: string, transloco: TranslocoService): string {
  const tag = shelfTag(key);
  return tag === null ? transloco.translate(`hub.shelf.${key}`) : capitalised(tag);
}
