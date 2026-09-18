export const qk = {
  /** Every releases query at once — what the hub invalidates when you come back to it. */
  releasesAll: () => ['releases'] as const,
  releases: (params: Record<string, unknown>) => ['releases', params] as const,
  releaseCount: (params: Record<string, unknown>) => ['releases', 'count', params] as const,
  release: (id: number) => ['release', id] as const,
  releasesByIds: (ids: readonly number[]) => ['releases', 'byIds', [...ids].sort()] as const,
  featuredRelease: () => ['releases', 'featured'] as const,
  releaseImage: (id: number) => ['release', id, 'image'] as const,
  releaseContentUrl: (id: number) => ['release', id, 'content-url'] as const,
  likeStatus: (id: number) => ['release', id, 'like'] as const,
  comments: (id: number, page: number) => ['release', id, 'comments', page] as const,
  myProjects: (params: Record<string, unknown>) => ['projects', 'mine', params] as const,
  projectImage: (id: number) => ['project', id, 'image'] as const,
  /** Autosaves — the server writes one on every save, so this is what a save invalidates. */
  projectVersions: (id: number) => ['project', id, 'versions'] as const,
  /** Named versions, which only a checkpoint or a publish touches. */
  projectCheckpoints: (id: number) => ['project', id, 'checkpoints'] as const,
  /** Deployment-wide, so it carries no project id. */
  projectLimits: () => ['project', 'limits'] as const,
  publicProfile: (username: string) => ['user', username] as const,
  userAvatar: (id: number) => ['user', id, 'avatar'] as const,
  userGames: (id: number, kind: 'published' | 'liked') => ['user', id, kind] as const,
};
