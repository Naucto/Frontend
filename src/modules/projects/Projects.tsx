import React, { JSX, useEffect, useMemo, useState } from "react";
import { styled } from "@mui/material";
import ProjectCard from "./components/ProjectCard";
import { ProjectResponseDto, projectControllerFindAll } from "@api";
import CreateProjectCard from "@modules/projects/components/CreateProjectCard";
import { useAsync } from "src/hooks/useAsync";
import { useUser } from "@providers/UserProvider";
import { useNavigate } from "react-router-dom";
import * as urls from "@shared/route";
import { Autocomplete, Box, Button, Chip, FormControl, MenuItem, Select, TextField, Typography } from "@mui/material";
import { PREDEFINED_PROJECT_TAGS } from "@modules/projects/projectTags";

const PageContainer = styled("div")(({ theme }) => ({
  margin: theme.spacing(4),
}));

const Title = styled(Typography)(({ theme }) => ({
  fontSize: "32px",
  color: theme.palette.text.primary,
  fontWeight: "normal",
  padding: theme.spacing(0, 0),
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

const HeaderRow = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: theme.spacing(2),
  flexWrap: "wrap",
}));

const HeaderControls = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1),
  flexWrap: "wrap",
}));

const Section = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(4),
}));

const SectionHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: theme.spacing(2),
  flexWrap: "wrap",
  marginBottom: theme.spacing(2),
}));

const SectionTitle = styled(Typography)(({ theme }) => ({
  fontSize: "24px",
  fontWeight: 500,
  color: theme.palette.text.primary,
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

const ProjectCardsContainer = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 300px))",
  gap: theme.spacing(2),
  justifyContent: "start",
}));

const EmptyState = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontSize: "15px",
  padding: theme.spacing(1, 0),
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

type SortMetric = "updatedAt" | "createdAt" | "name" | "publishedAt" | "tags";
type SortOrder = "asc" | "desc";

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

const Projects: React.FC = () => {
  const user = useUser();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<ProjectResponseDto[]>([]);
  const [showCustomSort, setShowCustomSort] = useState(false);
  const [sortMetric, setSortMetric] = useState<SortMetric>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const { value: fetchedProjects } = useAsync(
    () => projectControllerFindAll().then(({ data }) => data),
    []
  );

  useEffect(() => {
    if (!user.user) {
      navigate(urls.toHub());
      return;
    }
    if (fetchedProjects) {
      setProjects(fetchedProjects);
    }
  }, [fetchedProjects, user.user, navigate]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>(PREDEFINED_PROJECT_TAGS);
    projects.forEach((project) => {
      project.tags.forEach((tag) => tags.add(tag));
    });

    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => (
      selectedTags.length === 0 || selectedTags.every((tag) => project.tags.includes(tag))
    ));
  }, [projects, selectedTags]);

  const publishedProjects = useMemo(
    () => sortProjects(
      filteredProjects.filter((project) => project.status === ("COMPLETED" satisfies ProjectResponseDto["status"])),
      sortMetric,
      sortOrder,
    ),
    [filteredProjects, sortMetric, sortOrder]
  );

  const draftProjects = useMemo(
    () => sortProjects(
      filteredProjects.filter((project) => project.status !== ("COMPLETED" satisfies ProjectResponseDto["status"])),
      sortMetric,
      sortOrder,
    ),
    [filteredProjects, sortMetric, sortOrder]
  );

  const renderSection = (
    title: string,
    sectionProjects: ProjectResponseDto[],
    options?: { includeCreateCard?: boolean; emptyMessage: string }
  ): JSX.Element => (
    <Section>
      <SectionHeader>
        <SectionTitle>{title}</SectionTitle>
        <SummaryChip label={`${sectionProjects.length} project${sectionProjects.length === 1 ? "" : "s"}`} size="small" />
      </SectionHeader>
      {sectionProjects.length > 0 || options?.includeCreateCard ? (
        <ProjectCardsContainer>
          {options?.includeCreateCard ? <CreateProjectCard /> : null}
          {sectionProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </ProjectCardsContainer>
      ) : (
        <EmptyState>{options?.emptyMessage}</EmptyState>
      )}
    </Section>
  );

  return (
    <PageContainer>
      <HeaderRow>
        <Title variant="h1">Projects</Title>
        <HeaderControls>
          <CustomSortButton variant="outlined" onClick={() => setShowCustomSort((value) => !value)}>
            {showCustomSort ? "Hide custom sort" : "Custom sort"}
          </CustomSortButton>
          <SummaryChip label={`Sort: ${getSortMetricLabel(sortMetric)}`} size="small" />
          <SummaryChip label={`Order: ${getSortOrderLabel(sortOrder)}`} size="small" />
          {selectedTags.map((tag) => (
            <SummaryChip
              key={`selected-tag-${tag}`}
              label={tag}
              size="small"
              onDelete={() => setSelectedTags((current) => current.filter((currentTag) => currentTag !== tag))}
            />
          ))}
        </HeaderControls>
      </HeaderRow>

      {showCustomSort ? (
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
        </FilterPanel>
      ) : null}

      {renderSection("Drafts", draftProjects, {
        includeCreateCard: true,
        emptyMessage: "No drafts yet. Create a new project to get started.",
      })}
      {renderSection("Published", publishedProjects, {
        emptyMessage: "No published projects yet.",
      })}
    </PageContainer>
  );
};

export default Projects;
