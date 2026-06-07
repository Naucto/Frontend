import { type ProjectResponseDto } from "@api";

export type ProjectSortMetric = "updatedAt" | "createdAt" | "name" | "publishedAt" | "tags";
export type ProjectSortOrder = "asc" | "desc";
export type ProjectCategory = "drafts" | "published";

const PUBLISHED_PROJECT_STATUS = "COMPLETED" satisfies ProjectResponseDto["status"];

export function isProjectCategory(value: string | undefined): value is ProjectCategory {
  return value === "drafts" || value === "published";
}

export function getProjectSortMetricLabel(metric: ProjectSortMetric): string {
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

export function getProjectSortOrderLabel(order: ProjectSortOrder): string {
  return order === "asc" ? "Ascending" : "Descending";
}

export function projectMatchesCategory(project: ProjectResponseDto, category: ProjectCategory): boolean {
  return category === "published"
    ? project.status === PUBLISHED_PROJECT_STATUS
    : project.status !== PUBLISHED_PROJECT_STATUS;
}

export function projectMatchesNameAndTags(
  project: ProjectResponseDto,
  selectedTags: string[],
  projectNameQuery: string,
): boolean {
  return (
    (selectedTags.length === 0 || selectedTags.every((tag) => project.tags.includes(tag)))
    && project.name.toLowerCase().includes(projectNameQuery.trim().toLowerCase())
  );
}

function getProjectDateValue(
  project: ProjectResponseDto,
  metric: "updatedAt" | "createdAt" | "publishedAt",
): number {
  if (metric === "publishedAt") {
    return new Date(project.publishedAt || project.updatedAt || project.createdAt).getTime();
  }

  return new Date(project[metric]).getTime();
}

export function sortProjects(
  projects: ProjectResponseDto[],
  metric: ProjectSortMetric,
  order: ProjectSortOrder,
): ProjectResponseDto[] {
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
