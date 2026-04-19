import { ProjectResponseDto, projectControllerFindAllPaginated } from "@api";
import { Autocomplete, Box, Button, Chip, FormControl, LinearProgress, MenuItem, Select, TextField, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { PREDEFINED_PROJECT_TAGS } from "@modules/projects/projectTags";
import { useUser } from "@providers/UserProvider";
import * as urls from "@shared/route";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import ProjectCard from "./components/ProjectCard";

type SortMetric = "updatedAt" | "createdAt" | "name" | "publishedAt" | "tags";
type SortOrder = "asc" | "desc";
type ProjectCategoryKey = "drafts" | "published";

type ProjectCategoryPageState = {
  sortMetric?: SortMetric;
  sortOrder?: SortOrder;
  selectedTags?: string[];
  projectNameQuery?: string;
};

const PAGE_SIZE = 24;

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
  gap: theme.spacing(1),
  flexWrap: "wrap",
}));

const SummaryChip = styled(Chip)(({ theme }) => ({
  backgroundColor: "rgba(255,255,255,0.08)",
  color: theme.palette.common.white,
  border: "1px solid rgba(255,255,255,0.12)",
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

const FilterPanel = styled(Box)(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(1.5),
  padding: theme.spacing(1.5),
  borderRadius: theme.custom.rounded.md,
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  backdropFilter: "blur(12px)",
  marginTop: theme.spacing(2),
  width: "100%",
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

function isProjectCategoryKey(value: string | undefined): value is ProjectCategoryKey {
  return value === "drafts" || value === "published";
}

function getSortMetricLabel(metric: SortMetric): string {
  switch (metric) {
    case "createdAt":
      return "Created";
    case "name":
      return "Name";
    case "publishedAt":
      return "Published";
    case "tags":
      return "Tags";
    default:
      return "Updated";
  }
}

function getSortOrderLabel(order: SortOrder): string {
  return order === "asc" ? "Ascending" : "Descending";
}

function getProjectDateValue(project: ProjectResponseDto, metric: "updatedAt" | "createdAt" | "publishedAt"): number {
  if (metric === "publishedAt") {
    return new Date(project.publishedAt || project.updatedAt || project.createdAt).getTime();
  }

  return new Date(project[metric]).getTime();
}

function sortProjects(projects: ProjectResponseDto[], metric: SortMetric, order: SortOrder): ProjectResponseDto[] {
  const direction = order === "asc" ? 1 : -1;

  return [...projects].sort((a, b) => {
    if (metric === "name") {
      const nameDiff = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (nameDiff !== 0) {
        return nameDiff * direction;
      }
    } else if (metric === "tags") {
      const tagsA = [...a.tags].sort((left, right) => left.localeCompare(right)).join(", ");
      const tagsB = [...b.tags].sort((left, right) => left.localeCompare(right)).join(", ");
      const tagDiff = tagsA.localeCompare(tagsB, undefined, { sensitivity: "base" });
      if (tagDiff !== 0) {
        return tagDiff * direction;
      }
    } else {
      const dateDiff = getProjectDateValue(a, metric) - getProjectDateValue(b, metric);
      if (dateDiff !== 0) {
        return dateDiff * direction;
      }
    }

    return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * direction;
  });
}

function getCategoryTitle(category: ProjectCategoryKey): string {
  return category === "drafts" ? "Draft projects" : "Published projects";
}

function getCategorySubtitle(category: ProjectCategoryKey): string {
  return category === "drafts"
    ? "Browse all of your draft projects."
    : "Browse all of your published projects.";
}

const ProjectCategoryPage: React.FC = () => {
  const { category } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useUser();
  const state = (location.state as ProjectCategoryPageState | null) ?? null;
  const [projects, setProjects] = useState<ProjectResponseDto[]>([]);
  const [sortMetric, setSortMetric] = useState<SortMetric>(state?.sortMetric ?? "updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>(state?.sortOrder ?? "desc");
  const [selectedTags, setSelectedTags] = useState<string[]>(state?.selectedTags ?? []);
  const [projectNameQuery, setProjectNameQuery] = useState(state?.projectNameQuery ?? "");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadedPage, setLoadedPage] = useState(0);
  const [totalProjects, setTotalProjects] = useState<number | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const mergeProjects = useCallback((current: ProjectResponseDto[], next: ProjectResponseDto[]): ProjectResponseDto[] => {
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
    const { data } = await projectControllerFindAllPaginated({
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

  const loadProjectsPage = useCallback(async (page: number, reset = false): Promise<void> => {
    setIsLoadingProjects(true);

    try {
      const response = await fetchProjectsPage(page);
      setProjects((current) => mergeProjects(reset ? [] : current, response.projects));
      setLoadedPage(response.page);
      setTotalProjects(response.total);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [fetchProjectsPage, mergeProjects]);

  useEffect(() => {
    if (!user.user) {
      navigate(urls.toHub());
      return;
    }

    if (!isProjectCategoryKey(category)) {
      navigate("/projects", { replace: true });
      return;
    }

    void loadProjectsPage(1, true);
  }, [category, loadProjectsPage, navigate, user.user]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>(PREDEFINED_PROJECT_TAGS);
    projects.forEach((project) => {
      project.tags.forEach((tag) => tags.add(tag));
    });

    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const filteredProjects = useMemo(() => (
    projects.filter((project) => (
      (selectedTags.length === 0 || selectedTags.every((tag) => project.tags.includes(tag)))
      && project.name.toLowerCase().includes(projectNameQuery.trim().toLowerCase())
    ))
  ), [projectNameQuery, projects, selectedTags]);

  const categoryProjects = useMemo(() => {
    if (!isProjectCategoryKey(category)) {
      return [];
    }

    const scopedProjects = filteredProjects.filter((project) => (
      category === "published"
        ? project.status === ("COMPLETED" satisfies ProjectResponseDto["status"])
        : project.status !== ("COMPLETED" satisfies ProjectResponseDto["status"])
    ));

    return sortProjects(scopedProjects, sortMetric, sortOrder);
  }, [category, filteredProjects, sortMetric, sortOrder]);

  const getCategoryProjectsFrom = useCallback((sourceProjects: ProjectResponseDto[]): ProjectResponseDto[] => {
    if (!isProjectCategoryKey(category)) {
      return [];
    }

    const filteredSourceProjects = sourceProjects.filter((project) => (
      (selectedTags.length === 0 || selectedTags.every((tag) => project.tags.includes(tag)))
      && project.name.toLowerCase().includes(projectNameQuery.trim().toLowerCase())
    ));

    const scopedProjects = filteredSourceProjects.filter((project) => (
      category === "published"
        ? project.status === ("COMPLETED" satisfies ProjectResponseDto["status"])
        : project.status !== ("COMPLETED" satisfies ProjectResponseDto["status"])
    ));

    return sortProjects(scopedProjects, sortMetric, sortOrder);
  }, [category, projectNameQuery, selectedTags, sortMetric, sortOrder]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [category, projectNameQuery, selectedTags, sortMetric, sortOrder]);

  const visibleProjects = categoryProjects.slice(0, visibleCount);
  const hasMoreProjects = totalProjects === null || projects.length < totalProjects;
  const canLoadMore = visibleProjects.length < categoryProjects.length || hasMoreProjects;

  const handleLoadMore = async (): Promise<void> => {
    const nextVisibleCount = visibleCount + PAGE_SIZE;
    const currentProjects = getCategoryProjectsFrom(projects);

    if (isLoadingProjects || isLoadingMore) {
      return;
    }

    if (!hasMoreProjects || currentProjects.length >= nextVisibleCount) {
      setVisibleCount(nextVisibleCount);
      return;
    }

    setIsLoadingMore(true);

    try {
      let mergedProjects = [...projects];
      let nextPage = loadedPage;
      let total = totalProjects ?? Number.MAX_SAFE_INTEGER;
      let scopedProjects = currentProjects;

      while (scopedProjects.length < nextVisibleCount && mergedProjects.length < total) {
        const response = await fetchProjectsPage(nextPage + 1);
        mergedProjects = mergeProjects(mergedProjects, response.projects);
        nextPage = response.page;
        total = response.total;
        scopedProjects = getCategoryProjectsFrom(mergedProjects);
      }

      setProjects(mergedProjects);
      setLoadedPage(nextPage);
      setTotalProjects(Number.isFinite(total) ? total : 0);
      setVisibleCount(Math.min(nextVisibleCount, scopedProjects.length));
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (!isProjectCategoryKey(category)) {
    return <></>;
  }

  return (
    <PageContainer>
      <HeaderRow>
        <HeaderCopy>
          <Title variant="h1">{getCategoryTitle(category)}</Title>
          <Subtitle>{getCategorySubtitle(category)}</Subtitle>
        </HeaderCopy>
        <HeaderControls>
          <CustomSortButton variant="outlined" onClick={() => navigate("/projects")}>
            Back to projects
          </CustomSortButton>
          <SummaryChip label={`${categoryProjects.length} project${categoryProjects.length === 1 ? "" : "s"}`} size="small" />
        </HeaderControls>
      </HeaderRow>

      <FilterPanel>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <Select
            value={sortMetric}
            onChange={(event) => setSortMetric(event.target.value as SortMetric)}
            sx={darkSelectSx}
            MenuProps={darkMenuProps}
          >
            <MenuItem value="updatedAt">Last updated</MenuItem>
            <MenuItem value="createdAt">Created date</MenuItem>
            <MenuItem value="publishedAt">Published date</MenuItem>
            <MenuItem value="name">Name</MenuItem>
            <MenuItem value="tags">Tags</MenuItem>
          </Select>
        </FormControl>
        <CustomSortButton variant="outlined" onClick={() => setSortOrder((current) => current === "asc" ? "desc" : "asc")}>
          {getSortOrderLabel(sortOrder)}
        </CustomSortButton>
        <SummaryChip label={`Sort: ${getSortMetricLabel(sortMetric)}`} size="small" />
        <TextField
          value={projectNameQuery}
          onChange={(event) => setProjectNameQuery(event.target.value)}
          label="Search by name"
          placeholder="Project name..."
          sx={{
            minWidth: 220,
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
        {projectNameQuery ? (
          <Chip
            label={`Name: ${projectNameQuery}`}
            size="small"
            onDelete={() => setProjectNameQuery("")}
          />
        ) : null}
      </FilterPanel>

      {categoryProjects.length > 0 ? (
        <>
          <ProjectGrid>
            {visibleProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </ProjectGrid>
          {canLoadMore ? (
            <LoadMoreRow>
              <Box sx={{ width: "100%", maxWidth: 320 }}>
                <CustomSortButton variant="outlined" onClick={() => void handleLoadMore()} disabled={isLoadingProjects || isLoadingMore} fullWidth>
                  Load more
                </CustomSortButton>
                {isLoadingMore ? <LinearProgress sx={{ mt: 1, borderRadius: 999 }} /> : null}
              </Box>
            </LoadMoreRow>
          ) : null}
        </>
      ) : (
        <EmptyState>No projects match the current selection.</EmptyState>
      )}
    </PageContainer>
  );
};

export default ProjectCategoryPage;
