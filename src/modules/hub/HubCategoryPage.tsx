import { ProjectExResponseDto, ProjectResponseDto, projectControllerGetAllReleases } from "@api";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { Autocomplete, Box, Button, Chip, FormControl, MenuItem, Select, TextField, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import ProjectCard from "@modules/projects/components/ProjectCard";
import { PREDEFINED_PROJECT_TAGS } from "@modules/projects/projectTags";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import { JSX, useEffect, useMemo, useState } from "react";
import { useAsync } from "src/hooks/useAsync";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import * as urls from "@shared/route";

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

const darkSelectSx = {
  color: "white",
  backgroundColor: "rgba(20, 20, 20, 0.72)",
  borderRadius: "8px",
  ".MuiOutlinedInput-notchedOutline": {
    borderColor: "rgba(255,255,255,0.18)",
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "rgba(255,255,255,0.3)",
  },
  ".MuiSvgIcon-root": {
    color: "white",
  },
};

const darkMenuProps = {
  PaperProps: {
    sx: {
      backgroundColor: "#1A1A1A",
      color: "white",
      backgroundImage: "none",
      ".MuiMenuItem-root": {
        color: "white",
      },
      ".MuiMenuItem-root.Mui-selected": {
        backgroundColor: "rgba(229, 211, 82, 0.18)",
      },
      ".MuiMenuItem-root:hover": {
        backgroundColor: "rgba(255,255,255,0.08)",
      },
    }
  }
};

type HubSortMetric = "weighted" | "viewCount" | "likes" | "commentCount" | "forkCount";
type HubDateOrder = "desc" | "asc";
type HubCategoryKey = "popular" | "new" | "played";
type HubListSortMetric = "lastPlayed" | "publishedAt" | "viewCount" | "likes" | "commentCount" | "forkCount" | "name" | "tags";

type HubCategoryPageState = {
  sortMetric?: HubSortMetric;
  releaseWindow?: "all" | "30d" | "7d";
  selectedTags?: string[];
  newGamesOrder?: HubDateOrder;
  newGamesSortMetric?: HubListSortMetric;
  newGamesTags?: string[];
  playedGamesOrder?: HubDateOrder;
  playedGamesSortMetric?: HubListSortMetric;
  playedGamesTags?: string[];
};

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
  const [sortMetric, setSortMetric] = useState<HubSortMetric>(state?.sortMetric ?? "weighted");
  const [releaseWindow, setReleaseWindow] = useState<"all" | "30d" | "7d">(state?.releaseWindow ?? "30d");
  const [selectedTags, setSelectedTags] = useState<string[]>(state?.selectedTags ?? []);
  const [newGamesOrder, setNewGamesOrder] = useState<HubDateOrder>(state?.newGamesOrder ?? "desc");
  const [newGamesSortMetric, setNewGamesSortMetric] = useState<HubListSortMetric>(state?.newGamesSortMetric ?? "publishedAt");
  const [newGamesTags, setNewGamesTags] = useState<string[]>(state?.newGamesTags ?? []);
  const [playedGamesOrder, setPlayedGamesOrder] = useState<HubDateOrder>(state?.playedGamesOrder ?? "desc");
  const [playedGamesSortMetric, setPlayedGamesSortMetric] = useState<HubListSortMetric>(state?.playedGamesSortMetric ?? "lastPlayed");
  const [playedGamesTags, setPlayedGamesTags] = useState<string[]>(state?.playedGamesTags ?? []);
  const [statsOverrides, setStatsOverrides] = useState<Record<number, Partial<Pick<ProjectResponseDto, "viewCount" | "likes" | "commentCount" | "forkCount">>>>({});
  const [playedRevision, setPlayedRevision] = useState(0);

  const { value: allProjects } = useAsync(
    () => projectControllerGetAllReleases().then(({ data }) => (data ?? []) as ProjectExResponseDto[]),
    []
  );

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

  const publishedProjects = useMemo<ProjectExResponseDto[]>(
    () =>
      (allProjects ?? []).filter(
        (project) => project.status === ("COMPLETED" satisfies ProjectResponseDto["status"])
      ).map((project) => ({
        ...project,
        ...statsOverrides[project.id]
      })),
    [allProjects, statsOverrides]
  );

  const availableTags = useMemo(() => {
    const tags = new Set<string>(PREDEFINED_PROJECT_TAGS);
    publishedProjects.forEach((project) => {
      project.tags.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [playedRevision, publishedProjects]);

  const popularGames = useMemo(() => {
    const now = Date.now();
    const releaseThreshold =
      releaseWindow === "7d"
        ? now - 7 * 24 * 60 * 60 * 1000
        : releaseWindow === "30d"
          ? now - 30 * 24 * 60 * 60 * 1000
          : null;

    const projects = publishedProjects.filter((project) => {
      const releaseTime = new Date(project.publishedAt || project.createdAt).getTime();
      const matchesWindow = releaseThreshold === null || releaseTime >= releaseThreshold;
      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.every((tag) => project.tags.includes(tag));

      return matchesWindow && matchesTags;
    });

    const score = (project: ProjectResponseDto): number => {
      if (sortMetric === "likes") return project.likes ?? 0;
      if (sortMetric === "commentCount") return project.commentCount ?? 0;
      if (sortMetric === "viewCount") return project.viewCount ?? 0;
      if (sortMetric === "forkCount") return project.forkCount ?? 0;
      return (project.viewCount ?? 0) + (project.likes ?? 0) * 4 + (project.commentCount ?? 0) * 3 + (project.forkCount ?? 0) * 5;
    };

    return [...projects].sort((a, b) => {
      const scoreDiff = score(b) - score(a);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime();
    });
  }, [publishedProjects, releaseWindow, selectedTags, sortMetric]);

  const sortListProjects = (
    projects: ProjectExResponseDto[],
    metric: HubListSortMetric,
    order: HubDateOrder,
    playedOrder: number[] = []
  ): ProjectExResponseDto[] => {
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
        const diff = new Date(a.publishedAt || a.createdAt).getTime() - new Date(b.publishedAt || b.createdAt).getTime();
        if (diff !== 0) {
          return diff * direction;
        }
      } else {
        const diff = (a[metric] ?? 0) - (b[metric] ?? 0);
        if (diff !== 0) {
          return diff * direction;
        }
      }

      return (new Date(a.publishedAt || a.createdAt).getTime() - new Date(b.publishedAt || b.createdAt).getTime()) * direction;
    });
  };

  const newGames = useMemo(
    () => sortListProjects(
      publishedProjects.filter((project) => newGamesTags.length === 0 || newGamesTags.every((tag) => project.tags.includes(tag))),
      newGamesSortMetric,
      newGamesOrder,
    ),
    [newGamesOrder, newGamesSortMetric, newGamesTags, publishedProjects]
  );

  const playedGames = useMemo(() => {
    const playedIds = LocalStorageManager.getPlayedProjects();
    return sortListProjects(
      playedIds
        .map((id) => publishedProjects.find((project) => project.id === id))
        .filter((project): project is ProjectExResponseDto => project !== undefined)
        .filter((project) => playedGamesTags.length === 0 || playedGamesTags.every((tag) => project.tags.includes(tag))),
      playedGamesSortMetric,
      playedGamesOrder,
      playedIds,
    );
  }, [playedGamesOrder, playedGamesSortMetric, playedGamesTags, publishedProjects]);

  if (!isHubCategoryKey(category)) {
    return <></>;
  }

  const projects = category === "popular" ? popularGames : category === "new" ? newGames : playedGames;

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
          <SummaryChip label={`${projects.length} game${projects.length === 1 ? "" : "s"}`} size="small" />
        </HeaderControls>
      </HeaderRow>

      {category === "popular" ? (
        <FilterPanel>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={releaseWindow}
              onChange={(event) => setReleaseWindow(event.target.value as "all" | "30d" | "7d")}
              sx={darkSelectSx}
              MenuProps={darkMenuProps}
            >
              <MenuItem value="all">All time</MenuItem>
              <MenuItem value="30d">1 month</MenuItem>
              <MenuItem value="7d">1 week</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <Select
              value={sortMetric}
              onChange={(event) => setSortMetric(event.target.value as HubSortMetric)}
              sx={darkSelectSx}
              MenuProps={darkMenuProps}
            >
              <MenuItem value="weighted">Popularity score</MenuItem>
              <MenuItem value="viewCount">Views</MenuItem>
              <MenuItem value="likes">Likes</MenuItem>
              <MenuItem value="commentCount">Comments</MenuItem>
              <MenuItem value="forkCount">
                <Box display="flex" alignItems="center" gap={1}>
                  <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />
                  <span>Forks</span>
                </Box>
              </MenuItem>
            </Select>
          </FormControl>
          <SummaryChip label={`Sort: ${getSortMetricLabel(sortMetric)}`} size="small" />
          <Autocomplete
            multiple
            options={availableTags}
            value={selectedTags}
            onChange={(_, value) => setSelectedTags(value)}
            sx={{ minWidth: 280, flex: 1 }}
            slotProps={{
              paper: {
                sx: {
                  backgroundColor: "#1A1A1A",
                  color: "white",
                  backgroundImage: "none",
                  ".MuiAutocomplete-listbox": {
                    maxHeight: 240,
                    overflowY: "auto",
                  },
                }
              },
              listbox: {
                sx: {
                  maxHeight: 240,
                  overflowY: "auto",
                }
              },
            }}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ color: "white", backgroundColor: "#1A1A1A !important" }}>
                {option}
              </Box>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Filter by tags"
                placeholder="Action, RPG..."
                sx={{
                  ".MuiOutlinedInput-root": {
                    color: "white",
                    backgroundColor: "rgba(20, 20, 20, 0.72)",
                  },
                  ".MuiInputLabel-root": {
                    color: "rgba(255,255,255,0.7)",
                  },
                  ".MuiInputLabel-root.Mui-focused": {
                    color: "white",
                  },
                }}
              />
            )}
          />
          {selectedTags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              onDelete={() => setSelectedTags((current) => current.filter((currentTag) => currentTag !== tag))}
            />
          ))}
        </FilterPanel>
      ) : (
        <FilterPanel>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <Select
              value={category === "new" ? newGamesSortMetric : playedGamesSortMetric}
              onChange={(event) => category === "new"
                ? setNewGamesSortMetric(event.target.value as HubListSortMetric)
                : setPlayedGamesSortMetric(event.target.value as HubListSortMetric)}
              sx={darkSelectSx}
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
            </Select>
          </FormControl>
          <CustomSortButton
            variant="outlined"
            onClick={() => category === "new"
              ? setNewGamesOrder((current) => current === "desc" ? "asc" : "desc")
              : setPlayedGamesOrder((current) => current === "desc" ? "asc" : "desc")}
          >
            {getDateOrderLabel(category === "new" ? newGamesOrder : playedGamesOrder)}
          </CustomSortButton>
          <SummaryChip label={`Sort: ${getListSortMetricLabel(category === "new" ? newGamesSortMetric : playedGamesSortMetric)}`} size="small" />
          <Autocomplete
            multiple
            options={availableTags}
            value={category === "new" ? newGamesTags : playedGamesTags}
            onChange={(_, value) => category === "new" ? setNewGamesTags(value) : setPlayedGamesTags(value)}
            sx={{ minWidth: 280, flex: 1 }}
            slotProps={{
              paper: {
                sx: {
                  backgroundColor: "#1A1A1A",
                  color: "white",
                  backgroundImage: "none",
                  ".MuiAutocomplete-listbox": {
                    maxHeight: 240,
                    overflowY: "auto",
                  },
                }
              },
              listbox: {
                sx: {
                  maxHeight: 240,
                  overflowY: "auto",
                }
              },
            }}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ color: "white", backgroundColor: "#1A1A1A !important" }}>
                {option}
              </Box>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Filter by tags"
                placeholder="Action, RPG..."
                sx={{
                  ".MuiOutlinedInput-root": {
                    color: "white",
                    backgroundColor: "rgba(20, 20, 20, 0.72)",
                  },
                  ".MuiInputLabel-root": {
                    color: "rgba(255,255,255,0.7)",
                  },
                  ".MuiInputLabel-root.Mui-focused": {
                    color: "white",
                  },
                }}
              />
            )}
          />
          {(category === "new" ? newGamesTags : playedGamesTags).map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              onDelete={() => category === "new"
                ? setNewGamesTags((current) => current.filter((currentTag) => currentTag !== tag))
                : setPlayedGamesTags((current) => current.filter((currentTag) => currentTag !== tag))}
            />
          ))}
        </FilterPanel>
      )}

      {projects.length > 0 ? (
        <ProjectGrid>
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} isPlayable />
          ))}
        </ProjectGrid>
      ) : (
        <EmptyState>No games match the current selection.</EmptyState>
      )}
    </PageContainer>
  );
};

export default HubCategoryPage;
