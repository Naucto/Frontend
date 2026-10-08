export const qk = {
  /** Prefix of every releases query, to invalidate them all at once. */
  releasesAll: () => ['releases'] as const,
  releases: (params: Record<string, unknown>) => ['releases', params] as const,
  release: (id: number) => ['release', id] as const,
  featuredRelease: () => ['releases', 'featured'] as const,
  releaseImage: (id: number) => ['release', id, 'image'] as const,
  releaseContentUrl: (id: number) => ['release', id, 'content-url'] as const,
  likeStatus: (id: number) => ['release', id, 'like'] as const,
  /** Every page of a release's comments, to invalidate them all at once. */
  commentsAll: (id: number) => ['release', id, 'comments'] as const,
  comments: (id: number, page: number) => ['release', id, 'comments', page] as const,
  /** Every project query at once — what a fork invalidates, since it can land on any shelf. */
  projectsAll: () => ['projects'] as const,
  /** Total only, so it shares the projects prefix and a fork refreshes it too. */
  projectCount: () => ['projects', 'count'] as const,
  /** Every profile query at once — what editing your own profile invalidates. */
  profileAll: () => ['profile'] as const,
  profile: (username: string) => ['profile', username] as const,
  profileGames: (userId: number) => ['profile', userId, 'games'] as const,
  profileLiked: (userId: number) => ['profile', userId, 'liked'] as const,
  profileCollabs: (userId: number) => ['profile', userId, 'collabs'] as const,
  profileRemixes: (userId: number) => ['profile', userId, 'remixes'] as const,
  friendship: (userId: number) => ['friendship', userId] as const,
  me: () => ['me'] as const,
  myAnalytics: () => ['me', 'analytics'] as const,
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
  /** The limit is part of the answer: two widgets asking for different counts must not share one. */
  searchPeople: (term: string, limit: number) => ['search', 'people', term, limit] as const,
  /** The friends list, and the prefix of every friends query, so invalidating it refreshes them all. */
  friends: () => ['friends'] as const,
  friendRequests: () => ['friends', 'requests'] as const,
  recentPlayers: () => ['friends', 'recent'] as const,
  friendCount: () => ['friends', 'count'] as const,
  sessions: (projectId: number) => ['sessions', projectId] as const,
};
