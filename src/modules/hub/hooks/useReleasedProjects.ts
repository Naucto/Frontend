import { projectControllerGetPaginatedReleases, ProjectExResponseDto } from "@api";

import { useCallback, useEffect, useState } from "react";

type FetchedPage = {
  projects: ProjectExResponseDto[];
  page: number;
  total: number;
};

export function mergeProjects(current: ProjectExResponseDto[], next: ProjectExResponseDto[]): ProjectExResponseDto[] {
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

export async function fetchReleasedProjectsPage(page: number, limit: number): Promise<FetchedPage> {
  const { data } = await projectControllerGetPaginatedReleases({
    query: { page, limit },
  });

  return {
    projects: data?.projects ?? [],
    page: data?.page ?? page,
    total: data?.total ?? 0,
  };
}

export type UseReleasedProjectsResult = {
  allProjects: ProjectExResponseDto[];
  setAllProjects: React.Dispatch<React.SetStateAction<ProjectExResponseDto[]>>;
  loadedPage: number;
  setLoadedPage: React.Dispatch<React.SetStateAction<number>>;
  totalProjects: number | null;
  setTotalProjects: React.Dispatch<React.SetStateAction<number | null>>;
  isLoadingProjects: boolean;
  setIsLoadingProjects: React.Dispatch<React.SetStateAction<boolean>>;
  loadError: boolean;
  hasMoreProjects: boolean;
  loadProjectsPage: (page: number, reset?: boolean) => Promise<void>;
  fetchPage: (page: number) => Promise<FetchedPage>;
};

export function useReleasedProjects(pageSize: number): UseReleasedProjectsResult {
  const [allProjects, setAllProjects] = useState<ProjectExResponseDto[]>([]);
  const [loadedPage, setLoadedPage] = useState(0);
  const [totalProjects, setTotalProjects] = useState<number | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const fetchPage = useCallback((page: number) => fetchReleasedProjectsPage(page, pageSize), [pageSize]);

  const loadProjectsPage = useCallback(async (page: number, reset = false): Promise<void> => {
    setIsLoadingProjects(true);
    setLoadError(false);

    try {
      const response = await fetchPage(page);
      setAllProjects((current) => mergeProjects(reset ? [] : current, response.projects));
      setLoadedPage(response.page);
      setTotalProjects(response.total);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    void loadProjectsPage(1, true);
  }, [loadProjectsPage]);

  const hasMoreProjects = totalProjects === null || allProjects.length < totalProjects;

  return {
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
    loadProjectsPage,
    fetchPage,
  };
}
