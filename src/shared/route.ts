export const toProject = (projectId: number) : string => `/projects/${projectId}`;
export const toProjectView = (projectId: number): string => `/project/${projectId}/play`;
export const toHub = (): string => "/hub";
export const toProfile = (profileId: number) : string => `/profile/${profileId}`;
export const toProfilePublishedGames = (profileId: number): string =>
  `/profile/${profileId}/published-games`;
export const toProfileLikedGames = (profileId: number): string =>
  `/profile/${profileId}/liked-games`;
