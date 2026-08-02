import { projectControllerGetPaginatedReleases, ProjectExResponseDto } from "@api";
import { FetchedProjectsPage, mergeProjectsById, usePaginatedProjects } from "@hooks/usePaginatedProjects";

import { useCallback, useEffect } from "react";

/** Re-exported for the released-projects pages that merge pages manually. */
export function mergeProjects(current: ProjectExResponseDto[], next: ProjectExResponseDto[]): ProjectExResponseDto[] {
  return mergeProjectsById(current, next);
}

export async function fetchReleasedProjectsPage(page: number, limit: number): Promise<FetchedProjectsPage<ProjectExResponseDto>> {
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
  fetchPage: (page: number) => Promise<FetchedProjectsPage<ProjectExResponseDto>>;
};

export function useReleasedProjects(pageSize: number): UseReleasedProjectsResult {
  const fetchPage = useCallback(
    (page: number) => fetchReleasedProjectsPage(page, pageSize),
    [pageSize],
  );
  const {
    projects,
    setProjects,
    loadedPage,
    setLoadedPage,
    totalProjects,
    setTotalProjects,
    isLoadingProjects,
    setIsLoadingProjects,
    loadError,
    hasMoreProjects,
    loadProjectsPage,
  } = usePaginatedProjects<ProjectExResponseDto>(fetchPage);

  useEffect(() => {
    void loadProjectsPage(1, true);
  }, [loadProjectsPage]);

  return {
    allProjects: projects,
    setAllProjects: setProjects,
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
