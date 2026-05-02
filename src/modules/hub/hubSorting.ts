import { ProjectExResponseDto, ProjectResponseDto } from "@api";

export type HubSortMetric = "viewCount" | "likes" | "commentCount" | "forkCount";
export type HubDateOrder = "desc" | "asc";
export type HubCategoryKey = "popular" | "new" | "played";
export type HubListSortMetric = "lastPlayed" | "publishedAt" | "viewCount" | "likes" | "commentCount" | "forkCount" | "name" | "tags";
export type HubReleaseWindow = "all" | "365d" | "30d" | "7d";
export type HubStatsOverride = Partial<Pick<ProjectResponseDto, "viewCount" | "likes" | "commentCount" | "forkCount">>;

export const PUBLISHED_PROJECT_STATUS = "COMPLETED" satisfies ProjectResponseDto["status"];

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const RELEASE_WINDOW_DAYS: Record<Exclude<HubReleaseWindow, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "365d": 365,
};

export function getReleaseWindowThreshold(releaseWindow: HubReleaseWindow): number | undefined {
  if (releaseWindow === "all") {
    return undefined;
  }

  return Date.now() - RELEASE_WINDOW_DAYS[releaseWindow] * DAY_IN_MS;
}

export function getPublishedTime(project: ProjectResponseDto): number {
  return new Date(project.publishedAt ?? project.updatedAt).getTime();
}

export function getPublishedProjects(
  sourceProjects: ProjectExResponseDto[],
  statsOverrides: Record<number, HubStatsOverride>
): ProjectExResponseDto[] {
  return sourceProjects
    .filter((project) => project.status === PUBLISHED_PROJECT_STATUS)
    .map((project) => ({
      ...project,
      ...statsOverrides[project.id],
    }));
}

export function projectMatchesNameAndTags(
  project: ProjectResponseDto,
  tags: string[],
  searchQuery: string
): boolean {
  return (
    (tags.length === 0 || tags.every((tag) => project.tags.includes(tag))) &&
    project.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );
}

export function filterReleasedProjects(
  projects: ProjectExResponseDto[],
  releaseWindow: HubReleaseWindow,
  tags: string[],
  searchQuery: string
): ProjectExResponseDto[] {
  const releaseThreshold = getReleaseWindowThreshold(releaseWindow);

  return projects.filter((project) => (
    (releaseThreshold === undefined || getPublishedTime(project) >= releaseThreshold) &&
    projectMatchesNameAndTags(project, tags, searchQuery)
  ));
}

export function getPopularityScore(project: ProjectResponseDto, metric: HubSortMetric): number {
  if (metric === "likes") return project.likes ?? 0;
  if (metric === "commentCount") return project.commentCount ?? 0;
  if (metric === "viewCount") return project.viewCount ?? 0;
  return project.forkCount ?? 0;
}

export function sortPopularProjects(
  projects: ProjectExResponseDto[],
  metric: HubSortMetric
): ProjectExResponseDto[] {
  return [...projects].sort((a, b) => {
    const scoreDiff = getPopularityScore(b, metric) - getPopularityScore(a, metric);

    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return getPublishedTime(b) - getPublishedTime(a);
  });
}

export function sortHubProjects(
  projects: ProjectExResponseDto[],
  metric: HubListSortMetric,
  order: HubDateOrder,
  playedOrder: number[] = []
): ProjectExResponseDto[] {
  const direction = order === "asc" ? 1 : -1;
  const playedIndex = new Map(playedOrder.map((projectId, index) => [projectId, index]));

  return [...projects].sort((a, b) => {
    if (metric === "lastPlayed") {
      const leftIndex = playedIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = playedIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      const diff = rightIndex - leftIndex;

      if (diff !== 0) {
        return diff * direction;
      }
    } else if (metric === "name") {
      const diff = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

      if (diff !== 0) {
        return diff * direction;
      }
    } else if (metric === "tags") {
      const left = [...a.tags].sort((x, y) => x.localeCompare(y)).join(", ");
      const right = [...b.tags].sort((x, y) => x.localeCompare(y)).join(", ");
      const diff = left.localeCompare(right, undefined, { sensitivity: "base" });

      if (diff !== 0) {
        return diff * direction;
      }
    } else if (metric === "publishedAt") {
      const diff = getPublishedTime(a) - getPublishedTime(b);

      if (diff !== 0) {
        return diff * direction;
      }
    } else {
      const diff = (a[metric] ?? 0) - (b[metric] ?? 0);

      if (diff !== 0) {
        return diff * direction;
      }
    }

    return (getPublishedTime(a) - getPublishedTime(b)) * direction;
  });
}

export function getPlayedProjectsFromPublished(
  playedIds: number[],
  publishedProjects: ProjectExResponseDto[]
): ProjectExResponseDto[] {
  const publishedProjectsById = new Map(
    publishedProjects.map((project) => [project.id, project])
  );

  return playedIds
    .map((id) => publishedProjectsById.get(id))
    .filter((project): project is ProjectExResponseDto => project !== undefined);
}
