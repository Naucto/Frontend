import { styled } from "@mui/material/styles";
import { JSX, useEffect, useMemo, useState } from "react";
import { ProjectExResponseDto, ProjectResponseDto, projectControllerGetAllReleases } from "@api";
import { useAsync } from "src/hooks/useAsync";
import { Autocomplete, Box, Button, Chip, FormControl, IconButton, MenuItem, Select, TextField, Typography } from "@mui/material";
import ProjectCard from "@modules/projects/components/ProjectCard";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import { PREDEFINED_PROJECT_TAGS } from "@modules/projects/projectTags";
import PrevSvg from "@assets/prev.svg";
import NextSvg from "@assets/next.svg";

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

const ViewMoreButton = styled(Typography)(({ theme }) => ({
  fontSize: "14px",
  color: theme.palette.primary.main,
  cursor: "pointer",
  "&:hover": {
    textDecoration: "underline",
  },
}));

const ScrollContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "flex-start",
  gap: theme.spacing(1.5),
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
  marginTop: 24,
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


const SummaryChip = styled(Chip)(({ theme }) => ({
  backgroundColor: "rgba(255,255,255,0.08)",
  color: theme.palette.common.white,
  border: "1px solid rgba(255,255,255,0.12)",
}));

function getSortMetricLabel(metric: "weighted" | "viewCount" | "likes" | "commentCount"): string {
  switch (metric) {
  case "viewCount":
    return "Views";
  case "likes":
    return "Likes";
  case "commentCount":
    return "Comments";
  default:
    return "Popularity";
  }
}

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

export const Hub = (): JSX.Element => {
  const [showCustomSort, setShowCustomSort] = useState(false);
  const [sortMetric, setSortMetric] = useState<"weighted" | "viewCount" | "likes" | "commentCount">("weighted");
  const [releaseWindow, setReleaseWindow] = useState<"all" | "30d" | "7d">("30d");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [statsOverrides, setStatsOverrides] = useState<Record<number, Partial<Pick<ProjectResponseDto, "viewCount" | "likes" | "commentCount">>>>({});
  const [playedRevision, setPlayedRevision] = useState(0);

  const { value: allProjects } = useAsync(
    () => projectControllerGetAllReleases().then(({ data }) => (data ?? []) as ProjectExResponseDto[]),
    []
  );

  useEffect(() => {
    const handleStatsUpdate = (event: Event): void => {
      const customEvent = event as CustomEvent<{
        projectId: number;
        changes: Partial<Pick<ProjectResponseDto, "viewCount" | "likes" | "commentCount">>;
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

  const filteredPopularProjects = useMemo(() => {
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
      return (project.viewCount ?? 0) + (project.likes ?? 0) * 4 + (project.commentCount ?? 0) * 3;
    };

    return [...projects].sort((a, b) => {
      const scoreDiff = score(b) - score(a);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime();
    });
  }, [publishedProjects, releaseWindow, selectedTags, sortMetric]);

  const newGames = useMemo(
    () =>
      [...publishedProjects].sort(
        (a, b) =>
          new Date(b.publishedAt || b.createdAt).getTime() -
          new Date(a.publishedAt || a.createdAt).getTime()
      ),
    [publishedProjects]
  );

  const playedGames = useMemo(() => {
    const playedIds = LocalStorageManager.getPlayedProjects();
    return playedIds
      .map((id) => publishedProjects.find((project) => project.id === id))
      .filter((project): project is ProjectExResponseDto => project !== undefined);
  }, [publishedProjects]);

  const scroll = (elementId: string, direction: "left" | "right"): void => {
    const container = document.getElementById(elementId);
    if (container) {
      const scrollAmount = direction === "left" ? -340 : 340;
      container.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  const renderCategory = (
    title: string,
    projects: ProjectResponseDto[],
    scrollId: string,
    headerControls?: JSX.Element,
    expandedContent?: JSX.Element,
  ): JSX.Element => (
    <CategorySection>
      <CategoryHeader>
        <CategoryHeaderTop>
          <CategoryTitleRow>
            <CategoryTitle>{title}</CategoryTitle>
            {headerControls}
          </CategoryTitleRow>
          <ViewMoreButton>{projects.length} games</ViewMoreButton>
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
          {projects.map((project) => (
            <ProjectCardWrapper key={project.id}>
              <ProjectCard project={project} isPlayable />
            </ProjectCardWrapper>
          ))}
        </ProjectsScroller>
        <RightScrollArea
          onClick={() => scroll(scrollId, "right")}
        >
          <ScrollButton className="scroll-button" size="small">
            <ArrowIcon src={NextSvg} alt="next" />
          </ScrollButton>
        </RightScrollArea>
      </ScrollContainer>
    </CategorySection>
  );

  return (
    <PageContainer>
      {renderCategory(
        "Popular games",
        filteredPopularProjects,
        "popular-games",
        <HeaderControls>
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
          <CustomSortButton variant="outlined" onClick={() => setShowCustomSort((value) => !value)}>
            {showCustomSort ? "Hide custom sort" : "Custom sort"}
          </CustomSortButton>
          <SummaryChip label={`Sort: ${getSortMetricLabel(sortMetric)}`} size="small" />
          {selectedTags.map((tag) => (
            <SummaryChip key={`selected-tag-${tag}`} label={tag} size="small" onDelete={() => setSelectedTags((current) => current.filter((currentTag) => currentTag !== tag))} />
          ))}
        </HeaderControls>,
        showCustomSort ? (
          <FilterPanel>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <Select
                value={sortMetric}
                onChange={(event) => setSortMetric(event.target.value as "weighted" | "viewCount" | "likes" | "commentCount")}
                sx={darkSelectSx}
                MenuProps={darkMenuProps}
              >
                <MenuItem value="weighted">Popularity score</MenuItem>
                <MenuItem value="viewCount">Views</MenuItem>
                <MenuItem value="likes">Likes</MenuItem>
                <MenuItem value="commentCount">Comments</MenuItem>
              </Select>
            </FormControl>
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
        ) : undefined,
      )}
      {renderCategory("New games", newGames, "new-games")}
      {renderCategory("Played games", playedGames, "played-games")}
    </PageContainer>
  );
};
