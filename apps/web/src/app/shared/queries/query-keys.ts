export const qk = {
  /** Prefix of every releases query, to invalidate them all at once. */
  releasesAll: () => ['releases'] as const,
  releases: (params: Record<string, unknown>) => ['releases', params] as const,
  release: (id: number) => ['release', id] as const,
  featuredRelease: () => ['releases', 'featured'] as const,
  releaseImage: (id: number) => ['release', id, 'image'] as const,
  releaseContentUrl: (id: number) => ['release', id, 'content-url'] as const,
  likeStatus: (id: number) => ['release', id, 'like'] as const,
  comments: (id: number, page: number) => ['release', id, 'comments', page] as const,
  /** Every project query at once — what a fork invalidates, since it can land on any shelf. */
  projectsAll: () => ['projects'] as const,
  profileAll: () => ['profile'] as const,
  myProjects: (params: Record<string, unknown>) => ['projects', 'mine', params] as const,
  projectImage: (id: number) => ['project', id, 'image'] as const,
  /** Autosaves — the server writes one on every save, so this is what a save invalidates. */
  projectVersions: (id: number) => ['project', id, 'versions'] as const,
  /** Named versions, which only a checkpoint or a publish touches. */
  projectCheckpoints: (id: number) => ['project', id, 'checkpoints'] as const,
  /** Deployment-wide, so it carries no project id. */
  projectLimits: () => ['project', 'limits'] as const,
  userAvatar: (id: number) => ['user', id, 'avatar'] as const,
  /** What the suggestion panel asks for, and everything that makes its answer different. */
  searchSuggest: (term: string, tagsOnly: boolean, signedIn: boolean) =>
    ['search', 'suggest', term, tagsOnly, signedIn] as const,
  searchPeople: (term: string) => ['search', 'people', term] as const,
  friends: () => ['friends'] as const,
  sessions: (projectId: number) => ['sessions', projectId] as const,
};
