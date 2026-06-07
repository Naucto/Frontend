import { ProjectExResponseDto } from "@api";
import { PREDEFINED_PROJECT_TAGS } from "@modules/projects/projectTags";
import * as urls from "@shared/navigation/routes";
import { LocalStorageManager } from "@utils/LocalStorageManager";

import { NewHubSection } from "./components/NewHubSection";
import { PlayedHubSection } from "./components/PlayedHubSection";
import { PopularHubSection } from "./components/PopularHubSection";
import { useHubEvents } from "./hooks/useHubEvents";
import { useReleasedProjectCount } from "./hooks/useReleasedProjectCount";
import { mergeProjects, useReleasedProjects } from "./hooks/useReleasedProjects";
import { getProjectsForCategory, HubFiltersState, INITIAL_FILTERS } from "./hubFiltersState";
import {
  filterReleasedProjects,
  getPlayedProjectsFromPublished,
  getPublishedProjects,
  HubCategoryKey,
  projectMatchesNameAndTags,
  sortHubProjects,
  sortPopularProjects,
} from "./hubSorting";

import { JSX, useEffect, useMemo, useState } from "react";

import { Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";

const PageContainer = styled("div")(({ theme }) => ({
  margin: theme.spacing(4),
}));

const StatusMessage = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontSize: "15px",
  marginBottom: theme.spacing(2),
}));

const PAGE_SIZE = 24;

type CategoryExpandedState = Record<HubCategoryKey, boolean>;
type CategoryVisibleCounts = Record<HubCategoryKey, number>;

const INITIAL_EXPANDED: CategoryExpandedState = {
  popular: false,
  new: false,
  played: false,
};

const INITIAL_VISIBLE_COUNTS: CategoryVisibleCounts = {
  popular: PAGE_SIZE,
  new: PAGE_SIZE,
  played: PAGE_SIZE,
};

export const Hub = (): JSX.Element => {
  const navigate = useNavigate();
  const [customSortOpen, setCustomSortOpen] = useState<CategoryExpandedState>(INITIAL_EXPANDED);
  const [filters, setFilters] = useState<HubFiltersState>(INITIAL_FILTERS);
  const [visibleCounts, setVisibleCounts] = useState<CategoryVisibleCounts>(INITIAL_VISIBLE_COUNTS);
  const [loadingMoreCategory, setLoadingMoreCategory] = useState<HubCategoryKey | null>(null);

  const { statsOverrides, playedRevision } = useHubEvents();
  const {
    allProjects,
    setAllProjects,
    loadedPage,
    setLoadedPage,
    totalProjects,
    setTotalProjects,
    isLoadingProjects,
    setIsLoadingProjects,
    loadError,
    hasMoreProjects,
    fetchPage,
  } = useReleasedProjects(PAGE_SIZE);

  const popularCount = useReleasedProjectCount({
    releaseWindow: filters.popular.releaseWindow,
    search: filters.popular.searchQuery,
    tags: filters.popular.selectedTags,
  });

  const newCount = useReleasedProjectCount({
    releaseWindow: filters.new.releaseWindow,
    search: filters.new.searchQuery,
    tags: filters.new.selectedTags,
  });

  const publishedProjects = useMemo<ProjectExResponseDto[]>(
    () => getPublishedProjects(allProjects, statsOverrides),
    [allProjects, statsOverrides]
  );

  const availableTags = useMemo(() => {
    const tags = new Set<string>(PREDEFINED_PROJECT_TAGS);
    publishedProjects.forEach((project) => project.tags.forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [publishedProjects]);

  const popularGames = useMemo(() => sortPopularProjects(
    filterReleasedProjects(
      publishedProjects,
      filters.popular.releaseWindow,
      filters.popular.selectedTags,
      filters.popular.searchQuery
    ),
    filters.popular.sortMetric
  ), [filters.popular, publishedProjects]);

  const newGames = useMemo(() => sortHubProjects(
    filterReleasedProjects(
      publishedProjects,
      filters.new.releaseWindow,
      filters.new.selectedTags,
      filters.new.searchQuery
    ),
    filters.new.sortMetric,
    filters.new.order,
  ), [filters.new, publishedProjects]);

  const playedGames = useMemo(() => {
    const playedIds = LocalStorageManager.getPlayedProjects();
    return sortHubProjects(
      getPlayedProjectsFromPublished(playedIds, publishedProjects)
        .filter((project) => (
          projectMatchesNameAndTags(project, filters.played.selectedTags, filters.played.searchQuery)
        )),
      filters.played.sortMetric,
      filters.played.order,
      playedIds,
    );
  }, [filters.played, publishedProjects, playedRevision]);

  const playedTotalCount = useMemo(() => {
    const playedIds = LocalStorageManager.getPlayedProjects();

    if (filters.played.selectedTags.length === 0 && !filters.played.searchQuery.trim()) {
      return playedIds.length;
    }

    return playedGames.length;
  }, [filters.played.searchQuery, filters.played.selectedTags, playedGames.length, playedRevision]);

  useEffect(() => {
    setVisibleCounts((current) => ({ ...current, popular: PAGE_SIZE }));
  }, [popularGames.length, filters.popular]);

  useEffect(() => {
    setVisibleCounts((current) => ({ ...current, new: PAGE_SIZE }));
  }, [newGames.length, filters.new]);

  useEffect(() => {
    setVisibleCounts((current) => ({ ...current, played: PAGE_SIZE }));
  }, [playedGames.length, filters.played]);

  const updateFilters = <K extends HubCategoryKey>(
    category: K,
    changes: Partial<HubFiltersState[K]>,
  ): void => {
    setFilters((current) => ({
      ...current,
      [category]: { ...current[category], ...changes },
    }));
  };

  const toggleExpanded = (category: HubCategoryKey): void => {
    setCustomSortOpen((current) => ({ ...current, [category]: !current[category] }));
  };

  const navigateToCategory = (categoryKey: HubCategoryKey): void => {
    navigate(urls.toHubCategory(categoryKey), {
      state: {
        sortMetric: filters.popular.sortMetric,
        releaseWindow: filters.popular.releaseWindow,
        selectedTags: filters.popular.selectedTags,
        popularSearchQuery: filters.popular.searchQuery,
        newGamesReleaseWindow: filters.new.releaseWindow,
        newGamesOrder: filters.new.order,
        newGamesSortMetric: filters.new.sortMetric,
        newGamesTags: filters.new.selectedTags,
        newGamesSearchQuery: filters.new.searchQuery,
        playedGamesOrder: filters.played.order,
        playedGamesSortMetric: filters.played.sortMetric,
        playedGamesTags: filters.played.selectedTags,
        playedGamesSearchQuery: filters.played.searchQuery,
      }
    });
  };

  const handleLoadMoreCategory = async (categoryKey: HubCategoryKey): Promise<void> => {
    const visibleCount = visibleCounts[categoryKey];
    const nextVisibleCount = visibleCount + PAGE_SIZE;
    const currentProjects = getProjectsForCategory(categoryKey, allProjects, filters, statsOverrides);

    if (isLoadingProjects) {
      return;
    }

    if (!hasMoreProjects || currentProjects.length >= nextVisibleCount) {
      setVisibleCounts((current) => ({ ...current, [categoryKey]: nextVisibleCount }));
      return;
    }

    let mergedProjects = [...allProjects];
    let nextPage = loadedPage;
    let total = totalProjects ?? Number.MAX_SAFE_INTEGER;
    let scopedProjects = currentProjects;

    setIsLoadingProjects(true);
    setLoadingMoreCategory(categoryKey);

    try {
      while (scopedProjects.length < nextVisibleCount && mergedProjects.length < total) {
        const response = await fetchPage(nextPage + 1);
        mergedProjects = mergeProjects(mergedProjects, response.projects);
        nextPage = response.page;
        total = response.total;
        scopedProjects = getProjectsForCategory(categoryKey, mergedProjects, filters, statsOverrides);
      }

      setAllProjects(mergedProjects);
      setLoadedPage(nextPage);
      setTotalProjects(Number.isFinite(total) ? total : 0);
      const reachedCount = Math.min(PAGE_SIZE, scopedProjects.length - visibleCount);
      setVisibleCounts((current) => ({ ...current, [categoryKey]: current[categoryKey] + reachedCount }));
    } finally {
      setIsLoadingProjects(false);
      setLoadingMoreCategory(null);
    }
  };

  return (
    <PageContainer>
      {loadError ? (
        <StatusMessage>
          Some games could not be loaded. Try refreshing the page.
        </StatusMessage>
      ) : null}

      <PopularHubSection
        availableTags={availableTags}
        filters={filters.popular}
        expanded={customSortOpen.popular}
        visibleProjects={popularGames.slice(0, visibleCounts.popular)}
        displayedCount={popularCount ?? popularGames.length}
        canLoadMore={visibleCounts.popular < popularGames.length || hasMoreProjects}
        isLoadingMore={loadingMoreCategory === "popular"}
        onToggleExpanded={() => toggleExpanded("popular")}
        onChange={(changes) => updateFilters("popular", changes)}
        onViewMore={() => navigateToCategory("popular")}
        onLoadMore={() => handleLoadMoreCategory("popular")}
      />

      <NewHubSection
        availableTags={availableTags}
        filters={filters.new}
        expanded={customSortOpen.new}
        visibleProjects={newGames.slice(0, visibleCounts.new)}
        displayedCount={newCount ?? newGames.length}
        canLoadMore={visibleCounts.new < newGames.length || hasMoreProjects}
        isLoadingMore={loadingMoreCategory === "new"}
        onToggleExpanded={() => toggleExpanded("new")}
        onChange={(changes) => updateFilters("new", changes)}
        onViewMore={() => navigateToCategory("new")}
        onLoadMore={() => handleLoadMoreCategory("new")}
      />

      <PlayedHubSection
        availableTags={availableTags}
        filters={filters.played}
        expanded={customSortOpen.played}
        visibleProjects={playedGames.slice(0, visibleCounts.played)}
        displayedCount={playedTotalCount}
        canLoadMore={visibleCounts.played < playedGames.length || hasMoreProjects}
        isLoadingMore={loadingMoreCategory === "played"}
        onToggleExpanded={() => toggleExpanded("played")}
        onChange={(changes) => updateFilters("played", changes)}
        onViewMore={() => navigateToCategory("played")}
        onLoadMore={() => handleLoadMoreCategory("played")}
      />
    </PageContainer>
  );
};
