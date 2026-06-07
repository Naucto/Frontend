import { projectControllerCountProjects, projectControllerFindAll, ProjectResponseDto } from "@api";
import { CustomSortButton, SummaryChip } from "@modules/projects/components/browse/Controls";
import { ProjectSortFilters } from "@modules/projects/components/browse/Filters";
import { ProjectPageHeader } from "@modules/projects/components/browse/Header";
import { PageContainer } from "@modules/projects/components/browse/Layout";
import { ProjectSection } from "@modules/projects/components/browse/ProjectSection";
import {
  getProjectSortMetricLabel,
  getProjectSortOrderLabel,
  type ProjectCategory,
  projectMatchesCategory,
  projectMatchesNameAndTags,
  type ProjectSortMetric,
  type ProjectSortOrder,
  sortProjects,
} from "@modules/projects/projectListUtils";
import { PREDEFINED_PROJECT_TAGS } from "@modules/projects/projectTags";
import { useUser } from "@providers/UserProvider";
import * as urls from "@shared/navigation/routes";

import { type JSX, useCallback, useEffect, useMemo, useState } from "react";

import { useNavigate } from "react-router-dom";

const PAGE_SIZE = 24;

const Projects = (): JSX.Element => {
  const user = useUser();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<ProjectResponseDto[]>([]);
  const [showCustomSort, setShowCustomSort] = useState(false);
  const [sortMetric, setSortMetric] = useState<ProjectSortMetric>("updatedAt");
  const [sortOrder, setSortOrder] = useState<ProjectSortOrder>("desc");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [projectNameQuery, setProjectNameQuery] = useState("");
  const [loadedPage, setLoadedPage] = useState(0);
  const [totalProjects, setTotalProjects] = useState<number | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [draftVisibleCount, setDraftVisibleCount] = useState(PAGE_SIZE);
  const [publishedVisibleCount, setPublishedVisibleCount] = useState(PAGE_SIZE);
  const [draftTotalCount, setDraftTotalCount] = useState<number | null>(null);
  const [publishedTotalCount, setPublishedTotalCount] = useState<number | null>(null);
  const [loadingMoreCategory, setLoadingMoreCategory] = useState<ProjectCategory | null>(null);

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
  }, []);

  const fetchProjectCount = useCallback(async (status: ProjectCategory): Promise<number> => {
    const { data } = await projectControllerCountProjects({
      query: {
        search: projectNameQuery.trim() || undefined,
        tags: selectedTags.length > 0 ? selectedTags.join(",") : undefined,
        status,
      },
    });

    return data?.total ?? 0;
  }, [projectNameQuery, selectedTags]);

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

    void loadProjectsPage(1, true);
  }, [loadProjectsPage, user.user, navigate]);

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

  const publishedProjects = useMemo(
    () => sortProjects(
      filteredProjects.filter((project) => projectMatchesCategory(project, "published")),
      sortMetric,
      sortOrder,
    ),
    [filteredProjects, sortMetric, sortOrder]
  );

  const draftProjects = useMemo(
    () => sortProjects(
      filteredProjects.filter((project) => projectMatchesCategory(project, "drafts")),
      sortMetric,
      sortOrder,
    ),
    [filteredProjects, sortMetric, sortOrder]
  );

  useEffect(() => {
    setDraftVisibleCount(PAGE_SIZE);
    setPublishedVisibleCount(PAGE_SIZE);
  }, [projectNameQuery, selectedTags, sortMetric, sortOrder]);

  useEffect(() => {
    let cancelled = false;

    void fetchProjectCount("drafts").then((total) => {
      if (!cancelled) {
        setDraftTotalCount(total);
      }
    });

    void fetchProjectCount("published").then((total) => {
      if (!cancelled) {
        setPublishedTotalCount(total);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fetchProjectCount]);

  const hasMoreProjects = totalProjects === null || projects.length < totalProjects;

  const getSectionProjectsFrom = useCallback((
    sourceProjects: ProjectResponseDto[],
    category: ProjectCategory
  ): ProjectResponseDto[] => {
    const filteredSourceProjects = sourceProjects.filter((project) => (
      projectMatchesNameAndTags(project, selectedTags, projectNameQuery)
    ));
    const scopedProjects = filteredSourceProjects.filter((project) => projectMatchesCategory(project, category));

    return sortProjects(scopedProjects, sortMetric, sortOrder);
  }, [projectNameQuery, selectedTags, sortMetric, sortOrder]);

  const loadMoreProjects = async (category: ProjectCategory): Promise<void> => {
    const visibleCount = category === "drafts" ? draftVisibleCount : publishedVisibleCount;
    const nextVisibleCount = visibleCount + PAGE_SIZE;
    const currentProjects = getSectionProjectsFrom(projects, category);

    if (isLoadingProjects || loadingMoreCategory !== null) {
      return;
    }

    if (!hasMoreProjects || currentProjects.length >= nextVisibleCount) {
      if (category === "drafts") {
        setDraftVisibleCount(nextVisibleCount);
      } else {
        setPublishedVisibleCount(nextVisibleCount);
      }
      return;
    }

    setLoadingMoreCategory(category);

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
        scopedProjects = getSectionProjectsFrom(mergedProjects, category);
      }

      setProjects(mergedProjects);
      setLoadedPage(nextPage);
      setTotalProjects(Number.isFinite(total) ? total : 0);

      if (category === "drafts") {
        setDraftVisibleCount(Math.min(nextVisibleCount, scopedProjects.length));
      } else {
        setPublishedVisibleCount(Math.min(nextVisibleCount, scopedProjects.length));
      }
    } finally {
      setLoadingMoreCategory(null);
    }
  };

  const handleViewMore = useCallback((category: ProjectCategory) => {
    navigate(urls.toProjectsCategory(category), {
      state: {
        sortMetric,
        sortOrder,
        selectedTags,
        projectNameQuery,
      }
    });
  }, [navigate, projectNameQuery, selectedTags, sortMetric, sortOrder]);

  const isLoadMoreDisabled = isLoadingProjects || loadingMoreCategory !== null;

  return (
    <PageContainer>
      <ProjectPageHeader title="Projects" variant="stacked">
        <CustomSortButton variant="outlined" onClick={() => setShowCustomSort((value) => !value)}>
          {showCustomSort ? "Hide custom sort" : "Custom sort"}
        </CustomSortButton>
        <SummaryChip label={`Sort: ${getProjectSortMetricLabel(sortMetric)}`} size="small" />
        <SummaryChip label={`Order: ${getProjectSortOrderLabel(sortOrder)}`} size="small" />
        {projectNameQuery ? <SummaryChip label={`Name: ${projectNameQuery}`} size="small" /> : null}
        {selectedTags.map((tag) => (
          <SummaryChip
            key={`selected-tag-${tag}`}
            label={tag}
            size="small"
            onDelete={() => setSelectedTags((current) => current.filter((currentTag) => currentTag !== tag))}
          />
        ))}
      </ProjectPageHeader>

      {showCustomSort ? (
        <ProjectSortFilters
          availableTags={availableTags}
          projectNameQuery={projectNameQuery}
          selectedTags={selectedTags}
          sortMetric={sortMetric}
          sortOrder={sortOrder}
          onProjectNameQueryChange={setProjectNameQuery}
          onSelectedTagsChange={setSelectedTags}
          onSortMetricChange={setSortMetric}
          onSortOrderToggle={() => setSortOrder((current) => current === "asc" ? "desc" : "asc")}
        />
      ) : null}

      <ProjectSection
        category="drafts"
        title="Drafts"
        projects={draftProjects}
        visibleCount={draftVisibleCount}
        totalCount={draftTotalCount}
        includeCreateCard
        emptyMessage="No drafts yet. Create a new project to get started."
        isLoading={isLoadMoreDisabled}
        loadMoreLabel={loadingMoreCategory === "drafts" ? "Loading..." : "Load more"}
        onLoadMore={(category) => void loadMoreProjects(category)}
        onViewMore={handleViewMore}
      />
      <ProjectSection
        category="published"
        title="Published"
        projects={publishedProjects}
        visibleCount={publishedVisibleCount}
        totalCount={publishedTotalCount}
        emptyMessage="No published projects yet."
        isLoading={isLoadMoreDisabled}
        loadMoreLabel={loadingMoreCategory === "published" ? "Loading..." : "Load more"}
        onLoadMore={(category) => void loadMoreProjects(category)}
        onViewMore={handleViewMore}
      />
    </PageContainer>
  );
};

export default Projects;
