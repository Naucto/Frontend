import { ProjectExResponseDto, ProjectResponseDto, projectControllerCountReleasedProjects, projectControllerGetPaginatedReleases, projectControllerGetRelease } from "@api";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { Autocomplete, Box, Button, Chip, FormControl, LinearProgress, MenuItem, Paper, Select, TextField, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import ProjectCard from "@modules/projects/components/ProjectCard";
import { PREDEFINED_PROJECT_TAGS } from "@modules/projects/projectTags";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import { JSX, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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

const HeaderRow = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: theme.spacing(2),
  flexWrap: "wrap",
}));

const HeaderCopy = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(0.75),
}));

const Title = styled(Typography)(({ theme }) => ({
  fontSize: "32px",
  color: theme.palette.text.primary,
  fontWeight: "normal",
}));

const Subtitle = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontSize: "14px",
}));

const HeaderControls = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: theme.spacing(1),
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
  marginTop: theme.spacing(2),
}));

const CustomSortButton = styled(Button)(({ theme }) => ({
  borderColor: "rgba(255,255,255,0.18)",
  color: theme.palette.common.white,
  backgroundColor: "rgba(20, 20, 20, 0.42)",
  "&:hover": {
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(20, 20, 20, 0.55)",
  },
}));

const SummaryChip = styled(Chip)(({ theme }) => ({
  backgroundColor: "rgba(255,255,255,0.08)",
  color: theme.palette.common.white,
  border: "1px solid rgba(255,255,255,0.12)",
}));

const ProjectGrid = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
  gap: theme.spacing(2),
  alignItems: "start",
  marginTop: theme.spacing(3),
}));

const EmptyState = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontSize: "15px",
  padding: theme.spacing(3, 0),
}));

const LoadMoreRow = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "center",
  marginTop: theme.spacing(2),
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

const LoadMoreContent = styled(Box)({
  width: "100%",
  maxWidth: 320,
});

const LoadMoreProgress = styled(LinearProgress)(({ theme }) => ({
  marginTop: theme.spacing(1),
  borderRadius: 999,
}));

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

type HubCategoryFiltersState = {
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

function createInitialFilters(state: HubCategoryPageState | null): HubCategoryFiltersState {
  return {
    popular: {
      sortMetric: state?.sortMetric ?? "viewCount",
      releaseWindow: state?.releaseWindow ?? "30d",
      selectedTags: state?.selectedTags ?? [],
      searchQuery: state?.popularSearchQuery ?? "",
    },
    new: {
      releaseWindow: state?.newGamesReleaseWindow ?? "30d",
      order: state?.newGamesOrder ?? "desc",
      sortMetric: state?.newGamesSortMetric ?? "publishedAt",
      selectedTags: state?.newGamesTags ?? [],
      searchQuery: state?.newGamesSearchQuery ?? "",
    },
    played: {
      order: state?.playedGamesOrder ?? "desc",
      sortMetric: state?.playedGamesSortMetric ?? "lastPlayed",
      selectedTags: state?.playedGamesTags ?? [],
      searchQuery: state?.playedGamesSearchQuery ?? "",
    },
  };
}

const PAGE_SIZE = 24;

function isHubCategoryKey(value: string | undefined): value is HubCategoryKey {
  return value === "popular" || value === "new" || value === "played";
}

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

function getDateOrderLabel(order: HubDateOrder): string {
  return order === "desc" ? "Newest first" : "Oldest first";
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
  const [filters, setFilters] = useState<HubCategoryFiltersState>(() => createInitialFilters(state));
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [allProjects, setAllProjects] = useState<ProjectExResponseDto[]>([]);
  const [loadedPage, setLoadedPage] = useState(0);
  const [totalProjects, setTotalProjects] = useState<number | null>(null);
  const [categoryTotalCount, setCategoryTotalCount] = useState<number | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [resolvedPlayedProjectCount, setResolvedPlayedProjectCount] = useState<number | null>(null);
  const [statsOverrides, setStatsOverrides] = useState<Record<number, HubStatsOverride>>({});
  const [playedRevision, setPlayedRevision] = useState(0);

  useEffect(() => {
    if (!isHubCategoryKey(category)) {
      navigate(urls.toHub(), { replace: true });
    }
  }, [category, navigate]);

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

    try {
      const response = await fetchProjectsPage(page);

      setAllProjects((current) => mergeProjects(reset ? [] : current, response.projects));
      setLoadedPage(response.page);
      setTotalProjects(response.total);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [fetchProjectsPage, mergeProjects]);

  useEffect(() => {
    void loadProjectsPage(1, true);
  }, [loadProjectsPage]);

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

  const popularGames = useMemo(() => {
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
  }, [filters.played, playedRevision, publishedProjects]);

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
          const { data } = await projectControllerGetRelease({
            path: { id: String(id) }
          });

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
        playedIds.filter(
          (id) => publishedProjectIds.has(id) || fetchedIds.has(id)
        ).length
      );
    });

    return () => {
      cancelled = true;
    };
  }, [allProjects, category, mergeProjects, playedRevision, statsOverrides]);

  useEffect(() => {
    let cancelled = false;

    if (category === "played") {
      setCategoryTotalCount(
        filters.played.selectedTags.length === 0 && !filters.played.searchQuery.trim()
          ? (resolvedPlayedProjectCount ?? playedGames.length)
          : playedGames.length
      );
      return () => {
        cancelled = true;
      };
    }

    void fetchReleasedProjectCount({
      releaseWindow: category === "popular" ? filters.popular.releaseWindow : category === "new" ? filters.new.releaseWindow : undefined,
      search: category === "popular" ? filters.popular.searchQuery : filters.new.searchQuery,
      tags: category === "popular" ? filters.popular.selectedTags : filters.new.selectedTags,
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
    fetchReleasedProjectCount,
    filters.new,
    filters.played.searchQuery,
    filters.played.selectedTags,
    filters.popular,
    playedGames.length,
    playedRevision,
    resolvedPlayedProjectCount,
  ]);

  const getScopedProjects = useCallback((sourceProjects: ProjectExResponseDto[]): ProjectExResponseDto[] => {
    const scopedPublishedProjects = getPublishedProjects(sourceProjects, statsOverrides);

    if (category === "popular") {
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

    if (category === "new") {
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
    category,
    filters,
    statsOverrides,
  ]);

  const projects = category === "popular" ? popularGames : category === "new" ? newGames : playedGames;
  const hasMoreProjects = totalProjects === null || allProjects.length < totalProjects;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [
    category,
    filters,
  ]);

  if (!isHubCategoryKey(category)) {
    return <></>;
  }
  const visibleProjects = projects.slice(0, visibleCount);
  const canLoadMore = visibleCount < (categoryTotalCount ?? projects.length);

  const handleLoadMore = async (): Promise<void> => {
    const nextVisibleCount = visibleCount + PAGE_SIZE;
    const currentProjects = getScopedProjects(allProjects);

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
        const response = await fetchProjectsPage(nextPage + 1);
        mergedProjects = mergeProjects(mergedProjects, response.projects);
        nextPage = response.page;
        total = response.total;
        scopedProjects = getScopedProjects(mergedProjects);
      }

      setAllProjects(mergedProjects);
      setLoadedPage(nextPage);
      setTotalProjects(Number.isFinite(total) ? total : 0);
      setVisibleCount(Math.min(nextVisibleCount, scopedProjects.length));
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <PageContainer>
      <HeaderRow>
        <HeaderCopy>
          <Title variant="h1">{getCategoryTitle(category)}</Title>
          <Subtitle>{getCategorySubtitle(category)}</Subtitle>
        </HeaderCopy>
        <HeaderControls>
          <CustomSortButton variant="outlined" onClick={() => navigate(urls.toHub())}>
            Back to Hub
          </CustomSortButton>
          <SummaryChip label={`${categoryTotalCount ?? projects.length} game${(categoryTotalCount ?? projects.length) === 1 ? "" : "s"}`} size="small" />
        </HeaderControls>
      </HeaderRow>

      {category === "popular" ? (
        <FilterPanel>
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
          <SummaryChip label={`Sort: ${getSortMetricLabel(filters.popular.sortMetric)}`} size="small" />
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
      ) : (
        <FilterPanel>
          {category === "new" ? (
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
          ) : null}
          <SelectFormControl size="small">
            <DarkSelect
              value={category === "new" ? filters.new.sortMetric : filters.played.sortMetric}
              onChange={(event) => setFilters((current) => category === "new"
                ? { ...current, new: { ...current.new, sortMetric: event.target.value as HubListSortMetric } }
                : { ...current, played: { ...current.played, sortMetric: event.target.value as HubListSortMetric } })}
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
          <CustomSortButton
            variant="outlined"
            onClick={() => setFilters((current) => category === "new"
              ? { ...current, new: { ...current.new, order: current.new.order === "desc" ? "asc" : "desc" } }
              : { ...current, played: { ...current.played, order: current.played.order === "desc" ? "asc" : "desc" } })}
          >
            {getDateOrderLabel(category === "new" ? filters.new.order : filters.played.order)}
          </CustomSortButton>
          <SummaryChip label={`Sort: ${getListSortMetricLabel(category === "new" ? filters.new.sortMetric : filters.played.sortMetric)}`} size="small" />
          <DarkTextField
            value={category === "new" ? filters.new.searchQuery : filters.played.searchQuery}
            onChange={(event) => setFilters((current) => category === "new"
              ? { ...current, new: { ...current.new, searchQuery: event.target.value } }
              : { ...current, played: { ...current.played, searchQuery: event.target.value } })}
            label="Search by name"
            placeholder="Game name..."
          />
          <TagsAutocomplete
            multiple
            options={availableTags}
            value={category === "new" ? filters.new.selectedTags : filters.played.selectedTags}
            onChange={(_, value) => setFilters((current) => category === "new"
              ? { ...current, new: { ...current.new, selectedTags: value } }
              : { ...current, played: { ...current.played, selectedTags: value } })}
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
          {(category === "new" ? filters.new.selectedTags : filters.played.selectedTags).map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              onDelete={() => setFilters((current) => category === "new"
                ? {
                  ...current,
                  new: {
                    ...current.new,
                    selectedTags: current.new.selectedTags.filter((currentTag) => currentTag !== tag),
                  },
                }
                : {
                  ...current,
                  played: {
                    ...current.played,
                    selectedTags: current.played.selectedTags.filter((currentTag) => currentTag !== tag),
                  },
                })}
            />
          ))}
        </FilterPanel>
      )}

      {projects.length > 0 ? (
        <>
          <ProjectGrid>
            {visibleProjects.map((project) => (
              <ProjectCard key={project.id} project={project} isPlayable />
            ))}
          </ProjectGrid>
          {canLoadMore ? (
            <LoadMoreRow>
              <LoadMoreContent>
                <CustomSortButton variant="outlined" onClick={() => void handleLoadMore()} disabled={isLoadingProjects || isLoadingMore} fullWidth>
                  Load more
                </CustomSortButton>
                {isLoadingMore ? <LoadMoreProgress /> : null}
              </LoadMoreContent>
            </LoadMoreRow>
          ) : null}
        </>
      ) : (
        <EmptyState>No games match the current selection.</EmptyState>
      )}
    </PageContainer>
  );
};

export default HubCategoryPage;
