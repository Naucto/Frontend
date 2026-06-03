export const toProject = (projectId: number) : string => `/projects/${projectId}`;
export const toProjectView = (projectId: number): string => `/project/${projectId}/play`;
export const toHub = (): string => "/hub";
export const toProfileByUsername = (username: string): string =>
  `/profile/${encodeURIComponent(username)}`;
export const toProfilePublishedGamesByUsername = (username: string): string =>
  `/profile/${encodeURIComponent(username)}/published-games`;
export const toProfileLikedGamesByUsername = (username: string): string =>
  `/profile/${encodeURIComponent(username)}/liked-games`;
