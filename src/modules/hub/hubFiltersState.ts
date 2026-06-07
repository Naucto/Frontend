import { ProjectExResponseDto } from "@api";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import {
  filterReleasedProjects,
  getPlayedProjectsFromPublished,
  getPublishedProjects,
  HubCategoryKey,
  HubStatsOverride,
  projectMatchesNameAndTags,
  sortHubProjects,
  sortPopularProjects,
} from "./hubSorting";
import { NewGamesFiltersState } from "./components/filters/NewGamesFiltersPanel";
import { PlayedGamesFiltersState } from "./components/filters/PlayedGamesFiltersPanel";
import { PopularFiltersState } from "./components/filters/PopularFiltersPanel";

export type HubFiltersState = {
  popular: PopularFiltersState;
  new: NewGamesFiltersState;
  played: PlayedGamesFiltersState;
};

export const INITIAL_FILTERS: HubFiltersState = {
  popular: {
    sortMetric: "viewCount",
    releaseWindow: "all",
    selectedTags: [],
    searchQuery: "",
  },
  new: {
    releaseWindow: "all",
    order: "desc",
    sortMetric: "publishedAt",
    selectedTags: [],
    searchQuery: "",
  },
  played: {
    order: "desc",
    sortMetric: "lastPlayed",
    selectedTags: [],
    searchQuery: "",
  },
};

export function getProjectsForCategory(
  categoryKey: HubCategoryKey,
  sourceProjects: ProjectExResponseDto[],
  filters: HubFiltersState,
  statsOverrides: Record<number, HubStatsOverride>,
): ProjectExResponseDto[] {
  const scopedPublishedProjects = getPublishedProjects(sourceProjects, statsOverrides);

  if (categoryKey === "popular") {
    return sortPopularProjects(
      filterReleasedProjects(
        scopedPublishedProjects,
        filters.popular.releaseWindow,
        filters.popular.selectedTags,
        filters.popular.searchQuery
      ),
      filters.popular.sortMetric
    );
  }

  if (categoryKey === "new") {
    return sortHubProjects(
      filterReleasedProjects(
        scopedPublishedProjects,
        filters.new.releaseWindow,
        filters.new.selectedTags,
        filters.new.searchQuery
      ),
      filters.new.sortMetric,
      filters.new.order,
    );
  }

  const playedIds = LocalStorageManager.getPlayedProjects();
  return sortHubProjects(
    getPlayedProjectsFromPublished(playedIds, scopedPublishedProjects)
      .filter((project) => (
        projectMatchesNameAndTags(project, filters.played.selectedTags, filters.played.searchQuery)
      )),
    filters.played.sortMetric,
    filters.played.order,
    playedIds,
  );
}
