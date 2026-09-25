export const toProject = (projectId: number) : string => `/projects/${projectId}`;
export const toProjectView = (projectId: number): string => `/project/${projectId}/play`;
/** Staff-only preview of any project, published or not. */
export const toProjectPreview = (projectId: number): string =>
  `/project/${projectId}/preview`;
export const toHub = (): string => "/hub";
export const toHubCategory = (category: string): string => `/hub/category/${category}`;
export const toProjectsCategory = (category: string): string => `/projects/category/${category}`;
export const toProfileByUsername = (username: string): string =>
  `/profile/${encodeURIComponent(username)}`;
export const toProfilePublishedGamesByUsername = (username: string): string =>
  `/profile/${encodeURIComponent(username)}/published-games`;
export const toProfileLikedGamesByUsername = (username: string): string =>
  `/profile/${encodeURIComponent(username)}/liked-games`;
