// TODO: Replace this fallback list with tags fetched from the published projects once
// the backend exposes a dedicated source of truth for available tags.
export const PREDEFINED_PROJECT_TAGS = [
  "Roguelike",
  "Shooter",
  "RPG",
  "Action",
  "Adventure"
] as const;

export const DEFAULT_VISIBLE_TAG_COUNT = 4;

/**
 * Build the sorted, de-duplicated set of tags available for filtering: the
 * predefined tags plus any tags present on the given projects.
 */
export function collectAvailableTags(projects: { tags: string[] }[]): string[] {
  const tags = new Set<string>(PREDEFINED_PROJECT_TAGS);
  projects.forEach((project) => project.tags.forEach((tag) => tags.add(tag)));
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}
