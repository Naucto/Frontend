import { ProjectResponseDto } from "@api";

import { HubStatsOverride } from "../hubSorting";

import { useEffect, useState } from "react";

type StatsUpdateDetail = {
  projectId: number;
  changes: Partial<Pick<ProjectResponseDto, "viewCount" | "likes" | "commentCount" | "forkCount">>;
};

export type UseHubEventsResult = {
  statsOverrides: Record<number, HubStatsOverride>;
  playedRevision: number;
};

export function useHubEvents(): UseHubEventsResult {
  const [statsOverrides, setStatsOverrides] = useState<Record<number, HubStatsOverride>>({});
  const [playedRevision, setPlayedRevision] = useState(0);

  useEffect(() => {
    const handleStatsUpdate = (event: Event): void => {
      const customEvent = event as CustomEvent<StatsUpdateDetail>;

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

  return { statsOverrides, playedRevision };
}
