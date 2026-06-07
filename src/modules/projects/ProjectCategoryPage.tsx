import { projectControllerFindAll, ProjectResponseDto } from "@api";
import { CustomSortButton, SummaryChip } from "@modules/projects/components/browse/Controls";
import { ProjectSortFilters } from "@modules/projects/components/browse/Filters";
import { ProjectPageHeader } from "@modules/projects/components/browse/Header";
import {
  EmptyState,
  LoadMoreContent,
  LoadMoreProgress,
  LoadMoreRow,
  PageContainer,
  ProjectGrid,
} from "@modules/projects/components/browse/Layout";
import {
  isProjectCategory,
  type ProjectCategory,
  projectMatchesCategory,
  projectMatchesNameAndTags,
  type ProjectSortMetric,
  type ProjectSortOrder,
  sortProjects,
} from "@modules/projects/projectListUtils";
import { PREDEFINED_PROJECT_TAGS } from "@modules/projects/projectTags";
import { useUser } from "@providers/UserProvider";
import * as urls from "@shared/route";

import ProjectCard from "./components/ProjectCard";

import { type JSX, useEffect, useMemo, useState } from "react";

import { useLocation, useNavigate, useParams } from "react-router-dom";

const PAGE_SIZE = 24;

type ProjectCategoryPageState = {
  sortMetric?: ProjectSortMetric;
  sortOrder?: ProjectSortOrder;
  selectedTags?: string[];
  projectNameQuery?: string;
};

function mergeProjects(current: ProjectResponseDto[], next: ProjectResponseDto[]): ProjectResponseDto[] {
  const mergedProjects = [...current, ...next];
  const seen = new Set<number>();

  return mergedProjects.filter((project) => {
    if (seen.has(project.id)) {
      return false;
    }

    seen.add(project.id);
    return true;
  });
}

async function fetchProjectsPage(page: number): Promise<{ projects: ProjectResponseDto[]; page: number; total: number }> {
  const { data } = await projectControllerFindAll({
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
}

function getCategoryTitle(category: ProjectCategory): string {
  return category === "drafts" ? "Draft projects" : "Published projects";
}

function getCategorySubtitle(category: ProjectCategory): string {
  return category === "drafts"
    ? "Browse all of your draft projects."
    : "Browse all of your published projects.";
}

const ProjectCategoryPage = (): JSX.Element => {
  const { category } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useUser();
  const state = (location.state as ProjectCategoryPageState | null) ?? null;
  const [projects, setProjects] = useState<ProjectResponseDto[]>([]);
  const [sortMetric, setSortMetric] = useState<ProjectSortMetric>(state?.sortMetric ?? "updatedAt");
  const [sortOrder, setSortOrder] = useState<ProjectSortOrder>(state?.sortOrder ?? "desc");
  const [selectedTags, setSelectedTags] = useState<string[]>(state?.selectedTags ?? []);
  const [projectNameQuery, setProjectNameQuery] = useState(state?.projectNameQuery ?? "");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadedPage, setLoadedPage] = useState(0);
  const [totalProjects, setTotalProjects] = useState<number | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    if (!user.user) {
      navigate(urls.toHub());
      return;
    }

    if (!isProjectCategory(category)) {
      navigate("/projects", { replace: true });
      return;
    }

    setIsLoadingProjects(true);
    void fetchProjectsPage(1).then((response) => {
      setProjects(mergeProjects([], response.projects));
      setLoadedPage(response.page);
      setTotalProjects(response.total);
    }).finally(() => {
      setIsLoadingProjects(false);
    });
  }, [category, navigate, user.user]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>(PREDEFINED_PROJECT_TAGS);
    projects.forEach((project) => {
      project.tags.forEach((tag) => tags.add(tag));
    });

    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const filteredProjects = useMemo(() => (
    projects.filter((project) => projectMatchesNameAndTags(project, selectedTags, projectNameQuery))
  ), [projectNameQuery, projects, selectedTags]);

  const categoryProjects = useMemo(() => {
    if (!isProjectCategory(category)) {
      return [];
    }

    const scopedProjects = filteredProjects.filter((project) => projectMatchesCategory(project, category));

    return sortProjects(scopedProjects, sortMetric, sortOrder);
  }, [category, filteredProjects, sortMetric, sortOrder]);

  const getCategoryProjectsFrom = (sourceProjects: ProjectResponseDto[]): ProjectResponseDto[] => {
    if (!isProjectCategory(category)) {
      return [];
    }

    const scopedProjects = sourceProjects
      .filter((project) => projectMatchesNameAndTags(project, selectedTags, projectNameQuery))
      .filter((project) => projectMatchesCategory(project, category));

    return sortProjects(scopedProjects, sortMetric, sortOrder);
  };

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

  if (!isProjectCategory(category)) {
    return <></>;
  }

  return (
    <PageContainer>
      <ProjectPageHeader title={getCategoryTitle(category)} subtitle={getCategorySubtitle(category)}>
        <CustomSortButton variant="outlined" onClick={() => navigate("/projects")}>
          Back to projects
        </CustomSortButton>
        <SummaryChip label={`${categoryProjects.length} project${categoryProjects.length === 1 ? "" : "s"}`} size="small" />
      </ProjectPageHeader>

      <ProjectSortFilters
        availableTags={availableTags}
        projectNameQuery={projectNameQuery}
        selectedTags={selectedTags}
        sortMetric={sortMetric}
        sortOrder={sortOrder}
        showAppliedChips
        showSortSummary
        onProjectNameQueryChange={setProjectNameQuery}
        onSelectedTagsChange={setSelectedTags}
        onSortMetricChange={setSortMetric}
        onSortOrderToggle={() => setSortOrder((current) => current === "asc" ? "desc" : "asc")}
      />

      {categoryProjects.length > 0 ? (
        <>
          <ProjectGrid $withTopMargin>
            {visibleProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
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
        <EmptyState>No projects match the current selection.</EmptyState>
      )}
    </PageContainer>
  );
};

export default ProjectCategoryPage;
