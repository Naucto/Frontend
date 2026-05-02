import { styled } from "@mui/material/styles";
import { JSX, useCallback, useEffect, useMemo, useState } from "react";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { ProjectExResponseDto, ProjectResponseDto, projectControllerCountReleasedProjects, projectControllerGetPaginatedReleases } from "@api";
import { Autocomplete, Box, Button, Chip, FormControl, IconButton, LinearProgress, MenuItem, Paper, Select, TextField, Typography } from "@mui/material";
import ProjectCard from "@modules/projects/components/ProjectCard";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import { PREDEFINED_PROJECT_TAGS } from "@modules/projects/projectTags";
import PrevSvg from "@assets/prev.svg";
import NextSvg from "@assets/next.svg";
import { useNavigate } from "react-router-dom";
import { darkMenuProps } from "@shared/darkMenuProps";
import * as urls from "@shared/route";
import {
  filterReleasedProjects,
  getPlayedProjectsFromPublished,
  getPublishedProjects,
  HubCategoryKey,
  HubDateOrder,
  HubListSortMetric,
  HubReleaseWindow,
  HubSortMetric,
  HubStatsOverride,
  projectMatchesNameAndTags,
  sortHubProjects,
  sortPopularProjects,
} from "./hubSorting";

const PageContainer = styled("div")(({ theme }) => ({
  margin: theme.spacing(4),
}));

const FilterPanel = styled(Box)(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(1.5),
  padding: theme.spacing(1.5),
  borderRadius: theme.custom.rounded.md,
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  backdropFilter: "blur(12px)",
  width: "100%",
}));

const CategorySection = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(4),
}));

const CategoryHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(1.25),
  marginBottom: theme.spacing(2),
}));

const CategoryHeaderTop = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: theme.spacing(1.5),
}));

const CategoryTitleRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: theme.spacing(1.5),
}));

const HeaderControls = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: theme.spacing(1),
}));

const CategoryTitle = styled(Typography)(({ theme }) => ({
  fontSize: "24px",
  fontWeight: "500",
  color: theme.palette.text.primary,
}));

const ViewMoreButton = styled(Button)(({ theme }) => ({
  fontSize: "14px",
  color: theme.palette.primary.main,
  padding: 0,
  minWidth: 0,
  textTransform: "none",
  "&:hover": {
    backgroundColor: "transparent",
    textDecoration: "underline",
  },
}));

const ScrollContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "flex-start",
  gap: theme.spacing(0.25),
}));

const ProjectsScroller = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(2),
  overflowX: "auto",
  scrollBehavior: "smooth",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": {
    display: "none",
  },
  paddingBottom: theme.spacing(1),
  flex: 1,
}));

const ScrollArea = styled(Box)(() => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}));

const LeftScrollArea = styled(ScrollArea)({});

const RightScrollArea = styled(ScrollArea)({});

const ScrollButton = styled(IconButton)(({ theme }) => ({
  width: 116,
  height: 116,
  padding: 0,
  marginTop: 18,
  backgroundColor: "transparent",
  color: theme.palette.common.white,
  flexShrink: 0,
  "&:hover": {
    backgroundColor: "transparent",
    transform: "translateY(-1px)",
  },
}));

const ProjectCardWrapper = styled(Box)({
  minWidth: "300px",
  maxWidth: "300px",
  flexShrink: 0,
});

const ArrowIcon = styled("img")({
  width: "80px",
  height: "80px",
  imageRendering: "pixelated",
});

const CustomSortButton = styled(Button)(({ theme }) => ({
  borderColor: "rgba(255,255,255,0.18)",
  color: theme.palette.common.white,
  backgroundColor: "rgba(20, 20, 20, 0.42)",
  "&:hover": {
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(20, 20, 20, 0.55)",
  },
}));

const SelectFormControl = styled(FormControl)<{ minwidth?: number }>(({ minwidth }) => ({
  minWidth: minwidth ?? 180,
}));

const DarkSelect = styled(Select)(({ theme }) => ({
  color: theme.palette.common.white,
  backgroundColor: "rgba(20, 20, 20, 0.72)",
  borderRadius: "8px",
  ".MuiOutlinedInput-notchedOutline": {
    borderColor: "rgba(255,255,255,0.18)",
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "rgba(255,255,255,0.3)",
  },
  ".MuiSvgIcon-root": {
    color: theme.palette.common.white,
  },
}));

const DarkTextField = styled(TextField)(({ theme }) => ({
  minWidth: 220,
  ".MuiOutlinedInput-root": {
    color: theme.palette.common.white,
    backgroundColor: "rgba(20, 20, 20, 0.72)",
  },
  ".MuiInputLabel-root": {
    color: "rgba(255,255,255,0.7)",
  },
  ".MuiInputLabel-root.Mui-focused": {
    color: theme.palette.common.white,
  },
}));

const TagsAutocomplete = styled(Autocomplete<string, true, false, false>)({
  minWidth: 280,
  flex: 1,
});

const AutocompleteOption = styled("li")({
  color: "white",
  backgroundColor: "#1A1A1A",
});

const SmallCopyIcon = styled(ContentCopyOutlinedIcon)({
  fontSize: 16,
});

const DarkAutocompletePaper = styled(Paper)({
  backgroundColor: "#1A1A1A",
  color: "white",
  backgroundImage: "none",
  ".MuiAutocomplete-listbox": {
    maxHeight: 240,
    overflowY: "auto",
  },
});

const DarkAutocompleteListbox = styled("ul")({
  maxHeight: 240,
  overflowY: "auto",
});

const autocompleteSlots = {
  paper: DarkAutocompletePaper,
  listbox: DarkAutocompleteListbox,
};

const LoadingBarContainer = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(1.5),
  width: "100%",
}));

const RoundedLinearProgress = styled(LinearProgress)({
  borderRadius: 999,
});

const StatusMessage = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontSize: "15px",
  marginBottom: theme.spacing(2),
}));

const SummaryChip = styled(Chip)(({ theme }) => ({
  backgroundColor: "rgba(255,255,255,0.08)",
  color: theme.palette.common.white,
  border: "1px solid rgba(255,255,255,0.12)",
}));

const PAGE_SIZE = 24;

function getSortMetricLabel(metric: HubSortMetric): string {
  switch (metric) {
    case "viewCount":
      return "Views";
    case "likes":
      return "Likes";
    case "commentCount":
      return "Comments";
    case "forkCount":
      return "Forks";
    default:
      return "Popularity";
  }
}

function getListSortMetricLabel(metric: HubListSortMetric): string {
  switch (metric) {
    case "lastPlayed":
      return "Last played";
    case "publishedAt":
      return "Published";
    case "viewCount":
      return "Views";
    case "likes":
      return "Likes";
    case "commentCount":
      return "Comments";
    case "forkCount":
      return "Forks";
    case "tags":
      return "Tags";
    default:
      return "Name";
  }
}

type HubFiltersState = {
  popular: {
    sortMetric: HubSortMetric;
    releaseWindow: HubReleaseWindow;
    selectedTags: string[];
    searchQuery: string;
  };
  new: {
    releaseWindow: HubReleaseWindow;
    order: HubDateOrder;
    sortMetric: HubListSortMetric;
    selectedTags: string[];
    searchQuery: string;
  };
  played: {
    order: HubDateOrder;
    sortMetric: HubListSortMetric;
    selectedTags: string[];
    searchQuery: string;
  };
};

const INITIAL_FILTERS: HubFiltersState = {
  popular: {
    sortMetric: "viewCount",
    releaseWindow: "30d",
    selectedTags: [],
    searchQuery: "",
  },
  new: {
    releaseWindow: "30d",
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

export const Hub = (): JSX.Element => {
  const navigate = useNavigate();
  const [customSortOpen, setCustomSortOpen] = useState<Record<HubCategoryKey, boolean>>({
    popular: false,
    new: false,
    played: false,
  });
  const [filters, setFilters] = useState<HubFiltersState>(INITIAL_FILTERS);
  const [visibleCounts, setVisibleCounts] = useState<Record<HubCategoryKey, number>>({
    popular: PAGE_SIZE,
    new: PAGE_SIZE,
    played: PAGE_SIZE,
  });
  const [categoryTotals, setCategoryTotals] = useState<Partial<Record<HubCategoryKey, number>>>({});
  const [allProjects, setAllProjects] = useState<ProjectExResponseDto[]>([]);
  const [loadedPage, setLoadedPage] = useState(0);
  const [totalProjects, setTotalProjects] = useState<number | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadingMoreCategory, setLoadingMoreCategory] = useState<HubCategoryKey | null>(null);
  const [statsOverrides, setStatsOverrides] = useState<Record<number, HubStatsOverride>>({});
  const [playedRevision, setPlayedRevision] = useState(0);

  useEffect(() => {
    const handleStatsUpdate = (event: Event): void => {
      const customEvent = event as CustomEvent<{
        projectId: number;
        changes: Partial<Pick<ProjectResponseDto, "viewCount" | "likes" | "commentCount" | "forkCount">>;
      }>;
      if (!customEvent.detail) {
        return;
      }

      setStatsOverrides((current) => ({
        ...current,
        [customEvent.detail.projectId]: {
          ...current[customEvent.detail.projectId],
          ...customEvent.detail.changes,
        }
      }));
    };

    const handlePlayedUpdate = (): void => {
      setPlayedRevision((value) => value + 1);
    };

    window.addEventListener("project-stats-updated", handleStatsUpdate as EventListener);
    window.addEventListener("played-history-updated", handlePlayedUpdate);

    return () => {
      window.removeEventListener("project-stats-updated", handleStatsUpdate as EventListener);
      window.removeEventListener("played-history-updated", handlePlayedUpdate);
    };
  }, []);

  const mergeProjects = useCallback((current: ProjectExResponseDto[], next: ProjectExResponseDto[]): ProjectExResponseDto[] => {
    const mergedProjects = [...current, ...next];
    const seen = new Set<number>();

    return mergedProjects.filter((project) => {
      if (seen.has(project.id)) {
        return false;
      }

      seen.add(project.id);
      return true;
    });
  }, []);

  const fetchProjectsPage = useCallback(async (page: number) => {
    const { data } = await projectControllerGetPaginatedReleases({
      query: {
        page,
        limit: PAGE_SIZE,
      },
    });

    return {
      projects: data?.projects ?? [],
      page: data?.page ?? page,
      total: data?.total ?? 0,
    };
  }, []);

  const fetchReleasedProjectCount = useCallback(async (params?: {
    releaseWindow?: HubReleaseWindow;
    search?: string;
    tags?: string[];
  }): Promise<number> => {
    const { data } = await projectControllerCountReleasedProjects({
      query: {
        releaseWindow: params?.releaseWindow,
        search: params?.search?.trim() || undefined,
        tags: params?.tags && params.tags.length > 0 ? params.tags.join(",") : undefined,
      },
    });

    return data?.total ?? 0;
  }, []);

  const loadProjectsPage = useCallback(async (page: number, reset = false): Promise<void> => {
    setIsLoadingProjects(true);
    setLoadError(false);

    try {
      const response = await fetchProjectsPage(page);
      setAllProjects((current) => mergeProjects(reset ? [] : current, response.projects));
      setLoadedPage(response.page);
      setTotalProjects(response.total);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [fetchProjectsPage, mergeProjects]);

  useEffect(() => {
    void loadProjectsPage(1, true);
  }, [loadProjectsPage]);

  useEffect(() => {
    let cancelled = false;

    void fetchReleasedProjectCount({
      releaseWindow: filters.popular.releaseWindow,
      search: filters.popular.searchQuery,
      tags: filters.popular.selectedTags,
    }).then((total) => {
      if (!cancelled) {
        setCategoryTotals((current) => ({ ...current, popular: total }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fetchReleasedProjectCount, filters.popular.releaseWindow, filters.popular.searchQuery, filters.popular.selectedTags]);

  useEffect(() => {
    let cancelled = false;

    void fetchReleasedProjectCount({
      releaseWindow: filters.new.releaseWindow,
      search: filters.new.searchQuery,
      tags: filters.new.selectedTags,
    }).then((total) => {
      if (!cancelled) {
        setCategoryTotals((current) => ({ ...current, new: total }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fetchReleasedProjectCount, filters.new.releaseWindow, filters.new.searchQuery, filters.new.selectedTags]);

  const publishedProjects = useMemo<ProjectExResponseDto[]>(
    () => getPublishedProjects(allProjects ?? [], statsOverrides),
    [allProjects, statsOverrides]
  );

  const availableTags = useMemo(() => {
    const tags = new Set<string>(PREDEFINED_PROJECT_TAGS);
    publishedProjects.forEach((project) => {
      project.tags.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [publishedProjects]);

  const filteredPopularProjects = useMemo(() => {
    const projects = filterReleasedProjects(
      publishedProjects,
      filters.popular.releaseWindow,
      filters.popular.selectedTags,
      filters.popular.searchQuery
    );

    return sortPopularProjects(projects, filters.popular.sortMetric);
  }, [filters.popular, publishedProjects]);

  const newGames = useMemo(
    () => sortHubProjects(
      filterReleasedProjects(
        publishedProjects,
        filters.new.releaseWindow,
        filters.new.selectedTags,
        filters.new.searchQuery
      ),
      filters.new.sortMetric,
      filters.new.order,
    ),
    [filters.new, publishedProjects]
  );

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

  const playedProjectsTotalCount = useMemo(() => {
    const playedIds = LocalStorageManager.getPlayedProjects();

    if (filters.played.selectedTags.length === 0 && !filters.played.searchQuery.trim()) {
      return playedIds.length;
    }

    return playedGames.length;
  }, [filters.played.searchQuery, filters.played.selectedTags, playedGames.length, playedRevision]);

  const getProjectsForCategory = useCallback((categoryKey: HubCategoryKey, sourceProjects: ProjectExResponseDto[]): ProjectExResponseDto[] => {
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
  }, [
    filters,
    statsOverrides,
  ]);

  const hasMoreProjects = totalProjects === null || allProjects.length < totalProjects;

  useEffect(() => {
    setVisibleCounts((current) => ({ ...current, popular: PAGE_SIZE }));
  }, [filteredPopularProjects.length, filters.popular]);

  useEffect(() => {
    setVisibleCounts((current) => ({ ...current, new: PAGE_SIZE }));
  }, [newGames.length, filters.new]);

  useEffect(() => {
    setVisibleCounts((current) => ({ ...current, played: PAGE_SIZE }));
  }, [playedGames.length, filters.played]);

  const getDateOrderLabel = (order: "desc" | "asc"): string => (order === "desc" ? "Newest first" : "Oldest first");

  const scroll = (elementId: string, direction: "left" | "right"): void => {
    const container = document.getElementById(elementId);
    if (container) {
      const scrollAmount = direction === "left" ? -340 : 340;
      container.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  const isNearScrollEnd = (elementId: string): boolean => {
    const container = document.getElementById(elementId);

    if (!container) {
      return false;
    }

    return container.scrollLeft + container.clientWidth >= container.scrollWidth - 24;
  };

  const loadMoreVisibleProjects = (categoryKey: HubCategoryKey, amount: number = PAGE_SIZE): void => {
    setVisibleCounts((current) => ({
      ...current,
      [categoryKey]: current[categoryKey] + amount,
    }));
  };

  const handleLoadMoreCategory = async (
    categoryKey: HubCategoryKey,
    visibleCount: number,
  ): Promise<void> => {
    const nextVisibleCount = visibleCount + PAGE_SIZE;
    const currentProjects = getProjectsForCategory(categoryKey, allProjects);

    if (isLoadingProjects) {
      return;
    }

    if (!hasMoreProjects || currentProjects.length >= nextVisibleCount) {
      loadMoreVisibleProjects(categoryKey);
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
        const response = await fetchProjectsPage(nextPage + 1);
        mergedProjects = mergeProjects(mergedProjects, response.projects);
        nextPage = response.page;
        total = response.total;
        scopedProjects = getProjectsForCategory(categoryKey, mergedProjects);
      }

      setAllProjects(mergedProjects);
      setLoadedPage(nextPage);
      setTotalProjects(Number.isFinite(total) ? total : 0);
      loadMoreVisibleProjects(categoryKey, Math.min(PAGE_SIZE, scopedProjects.length - visibleCount));
    } catch {
      setLoadError(true);
    } finally {
      setIsLoadingProjects(false);
      setLoadingMoreCategory(null);
    }
  };

  const renderCategory = (
    categoryKey: HubCategoryKey,
    title: string,
    projects: ProjectResponseDto[],
    scrollId: string,
    visibleCount: number,
    displayedCount: number,
    headerControls?: JSX.Element,
    expandedContent?: JSX.Element,
  ): JSX.Element => {
    const visibleProjects = projects.slice(0, visibleCount);
    const canLoadMore = visibleProjects.length < projects.length || hasMoreProjects;

    return (
      <CategorySection>
        <CategoryHeader>
          <CategoryHeaderTop>
            <CategoryTitleRow>
              <CategoryTitle>{title}</CategoryTitle>
              {headerControls}
            </CategoryTitleRow>
            <ViewMoreButton
              onClick={() => navigate(urls.toHubCategory(categoryKey), {
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
              })}
            >
              {displayedCount} games
            </ViewMoreButton>
          </CategoryHeaderTop>
          {expandedContent}
        </CategoryHeader>
        <ScrollContainer>
          <LeftScrollArea
            onClick={() => scroll(scrollId, "left")}
          >
            <ScrollButton className="scroll-button" size="small">
              <ArrowIcon src={PrevSvg} alt="previous" />
            </ScrollButton>
          </LeftScrollArea>
          <ProjectsScroller id={scrollId}>
            {visibleProjects.map((project) => (
              <ProjectCardWrapper key={project.id}>
                <ProjectCard project={project} isPlayable />
              </ProjectCardWrapper>
            ))}
          </ProjectsScroller>
          <RightScrollArea
            onClick={async () => {
              const shouldLoadMore = canLoadMore && isNearScrollEnd(scrollId);

              if (shouldLoadMore) {
                await handleLoadMoreCategory(categoryKey, visibleCount);
              }

              requestAnimationFrame(() => scroll(scrollId, "right"));
            }}
          >
            <ScrollButton className="scroll-button" size="small">
              <ArrowIcon src={NextSvg} alt="next" />
            </ScrollButton>
          </RightScrollArea>
        </ScrollContainer>
        {loadingMoreCategory === categoryKey ? (
          <LoadingBarContainer>
            <RoundedLinearProgress />
          </LoadingBarContainer>
        ) : null}
      </CategorySection>
    );
  };

  return (
    <PageContainer>
      {loadError ? (
        <StatusMessage>
          Some games could not be loaded. Try refreshing the page.
        </StatusMessage>
      ) : null}
      {renderCategory(
        "popular",
        "Popular games",
        filteredPopularProjects,
        "popular-games",
        visibleCounts.popular,
        categoryTotals.popular ?? filteredPopularProjects.length,
        <HeaderControls>
          <SelectFormControl size="small" minwidth={140}>
            <DarkSelect
              value={filters.popular.releaseWindow}
              onChange={(event) => setFilters((current) => ({
                ...current,
                popular: { ...current.popular, releaseWindow: event.target.value as HubReleaseWindow },
              }))}
              MenuProps={darkMenuProps}
            >
              <MenuItem value="all">All time</MenuItem>
              <MenuItem value="365d">1 year</MenuItem>
              <MenuItem value="30d">1 month</MenuItem>
              <MenuItem value="7d">1 week</MenuItem>
            </DarkSelect>
          </SelectFormControl>
          <CustomSortButton variant="outlined" onClick={() => setCustomSortOpen((current) => ({ ...current, popular: !current.popular }))}>
            {customSortOpen.popular ? "Hide custom sort" : "Custom sort"}
          </CustomSortButton>
          <SummaryChip label={`Sort: ${getSortMetricLabel(filters.popular.sortMetric)}`} size="small" />
          {filters.popular.searchQuery ? <SummaryChip label={`Name: ${filters.popular.searchQuery}`} size="small" /> : null}
          {filters.popular.selectedTags.map((tag) => (
            <SummaryChip
              key={`selected-tag-${tag}`}
              label={tag}
              size="small"
              onDelete={() => setFilters((current) => ({
                ...current,
                popular: {
                  ...current.popular,
                  selectedTags: current.popular.selectedTags.filter((currentTag) => currentTag !== tag),
                },
              }))}
            />
          ))}
        </HeaderControls>,
        customSortOpen.popular ? (
          <FilterPanel>
            <SelectFormControl size="small">
              <DarkSelect
                value={filters.popular.sortMetric}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  popular: { ...current.popular, sortMetric: event.target.value as HubSortMetric },
                }))}
                MenuProps={darkMenuProps}
              >
                <MenuItem value="viewCount">Views</MenuItem>
                <MenuItem value="likes">Likes</MenuItem>
                <MenuItem value="commentCount">Comments</MenuItem>
                <MenuItem value="forkCount">
                  <Box display="flex" alignItems="center" gap={1}>
                    <SmallCopyIcon />
                    <span>Forks</span>
                  </Box>
                </MenuItem>
              </DarkSelect>
            </SelectFormControl>
            <DarkTextField
              value={filters.popular.searchQuery}
              onChange={(event) => setFilters((current) => ({
                ...current,
                popular: { ...current.popular, searchQuery: event.target.value },
              }))}
              label="Search by name"
              placeholder="Game name..."
            />
            <TagsAutocomplete
              multiple
              options={availableTags}
              value={filters.popular.selectedTags}
              onChange={(_, value) => setFilters((current) => ({
                ...current,
                popular: { ...current.popular, selectedTags: value },
              }))}
              slots={autocompleteSlots}
              renderOption={(props, option) => (
                <AutocompleteOption {...props}>
                  {option}
                </AutocompleteOption>
              )}
              renderInput={(params) => (
                <DarkTextField
                  {...params}
                  label="Filter by tags"
                  placeholder="Action, RPG..."
                />
              )}
            />
            {filters.popular.selectedTags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                onDelete={() => setFilters((current) => ({
                  ...current,
                  popular: {
                    ...current.popular,
                    selectedTags: current.popular.selectedTags.filter((currentTag) => currentTag !== tag),
                  },
                }))}
              />
            ))}
          </FilterPanel>
        ) : undefined,
      )}
      {renderCategory(
        "new",
        "New games",
        newGames,
        "new-games",
        visibleCounts.new,
        categoryTotals.new ?? newGames.length,
        <HeaderControls>
          <SelectFormControl size="small" minwidth={140}>
            <DarkSelect
              value={filters.new.releaseWindow}
              onChange={(event) => setFilters((current) => ({
                ...current,
                new: { ...current.new, releaseWindow: event.target.value as HubReleaseWindow },
              }))}
              MenuProps={darkMenuProps}
            >
              <MenuItem value="all">All time</MenuItem>
              <MenuItem value="365d">1 year</MenuItem>
              <MenuItem value="30d">1 month</MenuItem>
              <MenuItem value="7d">1 week</MenuItem>
            </DarkSelect>
          </SelectFormControl>
          <CustomSortButton variant="outlined" onClick={() => setCustomSortOpen((current) => ({ ...current, new: !current.new }))}>
            {customSortOpen.new ? "Hide custom sort" : "Custom sort"}
          </CustomSortButton>
          <CustomSortButton variant="outlined" onClick={() => setFilters((current) => ({
            ...current,
            new: { ...current.new, order: current.new.order === "desc" ? "asc" : "desc" },
          }))}>
            {getDateOrderLabel(filters.new.order)}
          </CustomSortButton>
          <SummaryChip label={`Sort: ${getListSortMetricLabel(filters.new.sortMetric)}`} size="small" />
          {filters.new.searchQuery ? <SummaryChip label={`Name: ${filters.new.searchQuery}`} size="small" /> : null}
          {filters.new.selectedTags.map((tag) => (
            <SummaryChip
              key={`new-tag-${tag}`}
              label={tag}
              size="small"
              onDelete={() => setFilters((current) => ({
                ...current,
                new: {
                  ...current.new,
                  selectedTags: current.new.selectedTags.filter((currentTag) => currentTag !== tag),
                },
              }))}
            />
          ))}
        </HeaderControls>,
        customSortOpen.new ? (
          <FilterPanel>
            <SelectFormControl size="small">
              <DarkSelect
                value={filters.new.sortMetric}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  new: { ...current.new, sortMetric: event.target.value as HubListSortMetric },
                }))}
                MenuProps={darkMenuProps}
              >
                <MenuItem value="publishedAt">Published date</MenuItem>
                <MenuItem value="viewCount">Views</MenuItem>
                <MenuItem value="likes">Likes</MenuItem>
                <MenuItem value="commentCount">Comments</MenuItem>
                <MenuItem value="forkCount">Forks</MenuItem>
                <MenuItem value="name">Name</MenuItem>
                <MenuItem value="tags">Tags</MenuItem>
              </DarkSelect>
            </SelectFormControl>
            <DarkTextField
              value={filters.new.searchQuery}
              onChange={(event) => setFilters((current) => ({
                ...current,
                new: { ...current.new, searchQuery: event.target.value },
              }))}
              label="Search by name"
              placeholder="Game name..."
            />
            <TagsAutocomplete
              multiple
              options={availableTags}
              value={filters.new.selectedTags}
              onChange={(_, value) => setFilters((current) => ({
                ...current,
                new: { ...current.new, selectedTags: value },
              }))}
              slots={autocompleteSlots}
              renderOption={(props, option) => (
                <AutocompleteOption {...props}>
                  {option}
                </AutocompleteOption>
              )}
              renderInput={(params) => (
                <DarkTextField
                  {...params}
                  label="Filter by tags"
                  placeholder="Action, RPG..."
                />
              )}
            />
          </FilterPanel>
        ) : undefined
      )}
      {renderCategory(
        "played",
        "Played games",
        playedGames,
        "played-games",
        visibleCounts.played,
        playedProjectsTotalCount,
        <HeaderControls>
          <CustomSortButton variant="outlined" onClick={() => setCustomSortOpen((current) => ({ ...current, played: !current.played }))}>
            {customSortOpen.played ? "Hide custom sort" : "Custom sort"}
          </CustomSortButton>
          <CustomSortButton variant="outlined" onClick={() => setFilters((current) => ({
            ...current,
            played: { ...current.played, order: current.played.order === "desc" ? "asc" : "desc" },
          }))}>
            {getDateOrderLabel(filters.played.order)}
          </CustomSortButton>
          <SummaryChip label={`Sort: ${getListSortMetricLabel(filters.played.sortMetric)}`} size="small" />
          {filters.played.searchQuery ? <SummaryChip label={`Name: ${filters.played.searchQuery}`} size="small" /> : null}
          {filters.played.selectedTags.map((tag) => (
            <SummaryChip
              key={`played-tag-${tag}`}
              label={tag}
              size="small"
              onDelete={() => setFilters((current) => ({
                ...current,
                played: {
                  ...current.played,
                  selectedTags: current.played.selectedTags.filter((currentTag) => currentTag !== tag),
                },
              }))}
            />
          ))}
        </HeaderControls>,
        customSortOpen.played ? (
          <FilterPanel>
            <SelectFormControl size="small">
              <DarkSelect
                value={filters.played.sortMetric}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  played: { ...current.played, sortMetric: event.target.value as HubListSortMetric },
                }))}
                MenuProps={darkMenuProps}
              >
                <MenuItem value="lastPlayed">Last played</MenuItem>
                <MenuItem value="publishedAt">Published date</MenuItem>
                <MenuItem value="viewCount">Views</MenuItem>
                <MenuItem value="likes">Likes</MenuItem>
                <MenuItem value="commentCount">Comments</MenuItem>
                <MenuItem value="forkCount">Forks</MenuItem>
                <MenuItem value="name">Name</MenuItem>
                <MenuItem value="tags">Tags</MenuItem>
              </DarkSelect>
            </SelectFormControl>
            <DarkTextField
              value={filters.played.searchQuery}
              onChange={(event) => setFilters((current) => ({
                ...current,
                played: { ...current.played, searchQuery: event.target.value },
              }))}
              label="Search by name"
              placeholder="Game name..."
            />
            <TagsAutocomplete
              multiple
              options={availableTags}
              value={filters.played.selectedTags}
              onChange={(_, value) => setFilters((current) => ({
                ...current,
                played: { ...current.played, selectedTags: value },
              }))}
              slots={autocompleteSlots}
              renderOption={(props, option) => (
                <AutocompleteOption {...props}>
                  {option}
                </AutocompleteOption>
              )}
              renderInput={(params) => (
                <DarkTextField
                  {...params}
                  label="Filter by tags"
                  placeholder="Action, RPG..."
                />
              )}
            />
          </FilterPanel>
        ) : undefined
      )}
    </PageContainer>
  );
};
