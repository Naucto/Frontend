import { useCallback, useState } from "react";

export type FetchedProjectsPage<T> = {
  projects: T[];
  page: number;
  total: number;
};

/** De-duplicate a project list by id, keeping the first occurrence. */
export function mergeProjectsById<T extends { id: number }>(current: T[], next: T[]): T[] {
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

export type PaginatedProjects<T> = {
  projects: T[];
  setProjects: React.Dispatch<React.SetStateAction<T[]>>;
  loadedPage: number;
  setLoadedPage: React.Dispatch<React.SetStateAction<number>>;
  totalProjects: number | null;
  setTotalProjects: React.Dispatch<React.SetStateAction<number | null>>;
  isLoadingProjects: boolean;
  setIsLoadingProjects: React.Dispatch<React.SetStateAction<boolean>>;
  loadError: boolean;
  hasMoreProjects: boolean;
  loadProjectsPage: (page: number, reset?: boolean) => Promise<void>;
  fetchPage: (page: number) => Promise<FetchedProjectsPage<T>>;
};

/**
 * Generic paginated project-list engine shared by the Hub and Projects pages.
 * Owns the accumulated list, current page, total, loading/error state, and
 * id-based de-duplication. The caller supplies the endpoint-specific `fetchPage`
 * and decides when to trigger loads.
 */
export function usePaginatedProjects<T extends { id: number }>(
  fetchPage: (page: number) => Promise<FetchedProjectsPage<T>>,
): PaginatedProjects<T> {
  const [projects, setProjects] = useState<T[]>([]);
  const [loadedPage, setLoadedPage] = useState(0);
  const [totalProjects, setTotalProjects] = useState<number | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadProjectsPage = useCallback(async (page: number, reset = false): Promise<void> => {
    setIsLoadingProjects(true);
    setLoadError(false);

    try {
      const response = await fetchPage(page);
      setProjects((current) => mergeProjectsById(reset ? [] : current, response.projects));
      setLoadedPage(response.page);
      setTotalProjects(response.total);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [fetchPage]);

  const hasMoreProjects = totalProjects === null || projects.length < totalProjects;

  return {
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
    fetchPage,
  };
}
