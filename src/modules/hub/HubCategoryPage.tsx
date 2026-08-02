import { projectControllerGetRelease, ProjectExResponseDto } from "@api";
import { collectAvailableTags } from "@modules/projects/projectTags";
import * as urls from "@shared/navigation/routes";
import { LocalStorageManager } from "@utils/LocalStorageManager";

import { CategoryHeader } from "./components/CategoryHeader";
import { CategoryProjectsGrid } from "./components/CategoryProjectsGrid";
import { NewGamesFiltersPanel } from "./components/filters/NewGamesFiltersPanel";
import { PlayedGamesFiltersPanel } from "./components/filters/PlayedGamesFiltersPanel";
import { PopularFiltersPanel } from "./components/filters/PopularFiltersPanel";
import { useHubEvents } from "./hooks/useHubEvents";
import { fetchReleasedProjectCount } from "./hooks/useReleasedProjectCount";
import { mergeProjects, useReleasedProjects } from "./hooks/useReleasedProjects";
import {
  getProjectsForCategory,
  HubFiltersState,
  INITIAL_FILTERS,
} from "./hubFiltersState";
import {
  getPublishedProjects,
  HubCategoryKey,
  HubDateOrder,
  HubListSortMetric,
  HubReleaseWindow,
  HubSortMetric,
} from "./hubSorting";

import { JSX, useEffect, useMemo, useState } from "react";

import { styled } from "@mui/material/styles";
import { useLocation, useNavigate, useParams } from "react-router-dom";

const PageContainer = styled("div")(({ theme }) => ({
  margin: theme.spacing(4),
}));

const PAGE_SIZE = 24;

type HubCategoryPageState = {
  sortMetric?: HubSortMetric;
  releaseWindow?: HubReleaseWindow;
  selectedTags?: string[];
  popularSearchQuery?: string;
  newGamesReleaseWindow?: HubReleaseWindow;
  newGamesOrder?: HubDateOrder;
  newGamesSortMetric?: HubListSortMetric;
  newGamesTags?: string[];
  newGamesSearchQuery?: string;
  playedGamesOrder?: HubDateOrder;
  playedGamesSortMetric?: HubListSortMetric;
  playedGamesTags?: string[];
  playedGamesSearchQuery?: string;
};

function isHubCategoryKey(value: string | undefined): value is HubCategoryKey {
  return value === "popular" || value === "new" || value === "played";
}

function createInitialFilters(state: HubCategoryPageState | null): HubFiltersState {
  return {
    popular: {
      sortMetric: state?.sortMetric ?? INITIAL_FILTERS.popular.sortMetric,
      releaseWindow: state?.releaseWindow ?? INITIAL_FILTERS.popular.releaseWindow,
      selectedTags: state?.selectedTags ?? INITIAL_FILTERS.popular.selectedTags,
      searchQuery: state?.popularSearchQuery ?? INITIAL_FILTERS.popular.searchQuery,
    },
    new: {
      releaseWindow: state?.newGamesReleaseWindow ?? INITIAL_FILTERS.new.releaseWindow,
      order: state?.newGamesOrder ?? INITIAL_FILTERS.new.order,
      sortMetric: state?.newGamesSortMetric ?? INITIAL_FILTERS.new.sortMetric,
      selectedTags: state?.newGamesTags ?? INITIAL_FILTERS.new.selectedTags,
      searchQuery: state?.newGamesSearchQuery ?? INITIAL_FILTERS.new.searchQuery,
    },
    played: {
      order: state?.playedGamesOrder ?? INITIAL_FILTERS.played.order,
      sortMetric: state?.playedGamesSortMetric ?? INITIAL_FILTERS.played.sortMetric,
      selectedTags: state?.playedGamesTags ?? INITIAL_FILTERS.played.selectedTags,
      searchQuery: state?.playedGamesSearchQuery ?? INITIAL_FILTERS.played.searchQuery,
    },
  };
}

function getCategoryTitle(category: HubCategoryKey): string {
  switch (category) {
    case "new":
      return "New games";
    case "played":
      return "Played games";
    default:
      return "Popular games";
  }
}

function getCategorySubtitle(category: HubCategoryKey): string {
  switch (category) {
    case "new":
      return "Browse every newly published game in one full list.";
    case "played":
      return "Browse every game from your played history in one full list.";
    default:
      return "Browse the full popular games selection.";
  }
}

export const HubCategoryPage = (): JSX.Element => {
  const { category } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as HubCategoryPageState | null) ?? null;
  const [filters, setFilters] = useState<HubFiltersState>(() => createInitialFilters(state));
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [categoryTotalCount, setCategoryTotalCount] = useState<number | null>(null);
  const [resolvedPlayedProjectCount, setResolvedPlayedProjectCount] = useState<number | null>(null);

  const { statsOverrides, playedRevision } = useHubEvents();
  const {
    allProjects,
    setAllProjects,
    loadedPage,
    setLoadedPage,
    totalProjects,
    setTotalProjects,
    isLoadingProjects,
    hasMoreProjects,
    fetchPage,
  } = useReleasedProjects(PAGE_SIZE);

  useEffect(() => {
    if (!isHubCategoryKey(category)) {
      navigate(urls.toHub(), { replace: true });
    }
  }, [category, navigate]);

  const projects = useMemo<ProjectExResponseDto[]>(() => {
    if (!isHubCategoryKey(category)) {
      return [];
    }

    return getProjectsForCategory(category, allProjects, filters, statsOverrides);
    // playedRevision triggers re-evaluation when local played history changes
  }, [allProjects, category, filters, playedRevision, statsOverrides]);

  const availableTags = useMemo(
    () => collectAvailableTags(getPublishedProjects(allProjects, statsOverrides)),
    [allProjects, statsOverrides],
  );

  useEffect(() => {
    if (category !== "played") {
      setResolvedPlayedProjectCount(null);
      return;
    }

    const playedIds = LocalStorageManager.getPlayedProjects();

    if (playedIds.length === 0) {
      setResolvedPlayedProjectCount(0);
      return;
    }

    const publishedProjectIds = new Set(
      getPublishedProjects(allProjects, statsOverrides).map((project) => project.id)
    );
    const missingIds = playedIds.filter((id) => !publishedProjectIds.has(id));

    if (missingIds.length === 0) {
      setResolvedPlayedProjectCount(playedIds.length);
      return;
    }

    let cancelled = false;

    void Promise.all(
      missingIds.map(async (id) => {
        try {
          const { data } = await projectControllerGetRelease({ path: { id: String(id) } });
          return data ?? null;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (cancelled) {
        return;
      }

      const fetchedProjects = results.filter(
        (project): project is ProjectExResponseDto => project !== null
      );
      const fetchedIds = new Set(fetchedProjects.map((project) => project.id));

      setAllProjects((current) => mergeProjects(current, fetchedProjects));
      setResolvedPlayedProjectCount(
        playedIds.filter((id) => publishedProjectIds.has(id) || fetchedIds.has(id)).length
      );
    });

    return () => {
      cancelled = true;
    };
  }, [allProjects, category, playedRevision, setAllProjects, statsOverrides]);

  useEffect(() => {
    if (!isHubCategoryKey(category)) {
      return;
    }

    if (category === "played") {
      const isUnfiltered = filters.played.selectedTags.length === 0 && !filters.played.searchQuery.trim();
      setCategoryTotalCount(isUnfiltered ? (resolvedPlayedProjectCount ?? projects.length) : projects.length);
      return;
    }

    let cancelled = false;
    const scope = category === "popular" ? filters.popular : filters.new;

    void fetchReleasedProjectCount({
      releaseWindow: scope.releaseWindow,
      search: scope.searchQuery,
      tags: scope.selectedTags,
    }).then((total) => {
      if (!cancelled) {
        setCategoryTotalCount(total);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    category,
    filters.new,
    filters.played.searchQuery,
    filters.played.selectedTags,
    filters.popular,
    projects.length,
    resolvedPlayedProjectCount,
  ]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [category, filters]);

  if (!isHubCategoryKey(category)) {
    return <></>;
  }

  const visibleProjects = projects.slice(0, visibleCount);
  const canLoadMore = visibleCount < (categoryTotalCount ?? projects.length);

  const handleLoadMore = async (): Promise<void> => {
    const nextVisibleCount = visibleCount + PAGE_SIZE;
    const currentProjects = getProjectsForCategory(category, allProjects, filters, statsOverrides);

    if (isLoadingProjects || isLoadingMore) {
      return;
    }

    if (!hasMoreProjects || currentProjects.length >= nextVisibleCount) {
      setVisibleCount(nextVisibleCount);
      return;
    }

    setIsLoadingMore(true);

    try {
      let mergedProjects = [...allProjects];
      let nextPage = loadedPage;
      let total = totalProjects ?? Number.MAX_SAFE_INTEGER;
      let scopedProjects = currentProjects;

      while (scopedProjects.length < nextVisibleCount && mergedProjects.length < total) {
        const response = await fetchPage(nextPage + 1);
        mergedProjects = mergeProjects(mergedProjects, response.projects);
        nextPage = response.page;
        total = response.total;
        scopedProjects = getProjectsForCategory(category, mergedProjects, filters, statsOverrides);
      }

      setAllProjects(mergedProjects);
      setLoadedPage(nextPage);
      setTotalProjects(Number.isFinite(total) ? total : 0);
      setVisibleCount(Math.min(nextVisibleCount, scopedProjects.length));
    } finally {
      setIsLoadingMore(false);
    }
  };

  const updateFilters = <K extends HubCategoryKey>(
    key: K,
    changes: Partial<HubFiltersState[K]>,
  ): void => {
    setFilters((current) => ({
      ...current,
      [key]: { ...current[key], ...changes },
    }));
  };

  return (
    <PageContainer>
      <CategoryHeader
        title={getCategoryTitle(category)}
        subtitle={getCategorySubtitle(category)}
        count={categoryTotalCount ?? projects.length}
      />

      {category === "popular" ? (
        <PopularFiltersPanel
          availableTags={availableTags}
          filters={filters.popular}
          onChange={(changes) => updateFilters("popular", changes)}
        />
      ) : category === "new" ? (
        <NewGamesFiltersPanel
          availableTags={availableTags}
          filters={filters.new}
          onChange={(changes) => updateFilters("new", changes)}
        />
      ) : (
        <PlayedGamesFiltersPanel
          availableTags={availableTags}
          filters={filters.played}
          onChange={(changes) => updateFilters("played", changes)}
        />
      )}

      <CategoryProjectsGrid
        projects={projects}
        visibleProjects={visibleProjects}
        canLoadMore={canLoadMore}
        isLoading={isLoadingProjects}
        isLoadingMore={isLoadingMore}
        onLoadMore={handleLoadMore}
      />
    </PageContainer>
  );
};

export default HubCategoryPage;
