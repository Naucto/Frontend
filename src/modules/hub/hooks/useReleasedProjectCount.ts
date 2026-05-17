import { projectControllerCountReleasedProjects } from "@api";
import { useEffect, useState } from "react";
import { HubReleaseWindow } from "../hubSorting";

type CountQuery = {
  enabled?: boolean;
  releaseWindow?: HubReleaseWindow;
  search?: string;
  tags?: string[];
};

export async function fetchReleasedProjectCount(params?: {
  releaseWindow?: HubReleaseWindow;
  search?: string;
  tags?: string[];
}): Promise<number> {
  const { data } = await projectControllerCountReleasedProjects({
    query: {
      releaseWindow: params?.releaseWindow,
      search: params?.search?.trim() || undefined,
      tags: params?.tags && params.tags.length > 0 ? params.tags.join(",") : undefined,
    },
  });

  return data?.total ?? 0;
}

export function useReleasedProjectCount({
  enabled = true,
  releaseWindow,
  search,
  tags,
}: CountQuery): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setCount(null);
      return;
    }

    let cancelled = false;

    void fetchReleasedProjectCount({ releaseWindow, search, tags }).then((total) => {
      if (!cancelled) {
        setCount(total);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, releaseWindow, search, tags]);

  return count;
}
